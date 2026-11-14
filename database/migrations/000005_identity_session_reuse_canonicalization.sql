-- A replay transition is evidence about an already-rotated credential generation. Prevent a
-- caller from manufacturing replay by rotating and flagging reuse in one update, and make the
-- generation's revocation evidence canonical before the broader lifecycle guard observes it.

CREATE FUNCTION identity.canonicalize_session_reuse_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
BEGIN
  IF OLD.reuse_detected_at IS NULL AND NEW.reuse_detected_at IS NOT NULL THEN
    IF OLD.rotated_at IS NULL THEN
      RAISE EXCEPTION 'session reuse requires a previously committed rotation'
        USING ERRCODE = '23514', CONSTRAINT = 'sessions_reuse_committed_rotation_check';
    END IF;

    IF OLD.revoked_at IS NULL THEN
      NEW.revoked_at := NEW.reuse_detected_at;
      NEW.revoked_reason := 'REFRESH_TOKEN_REUSE_DETECTED';
    ELSE
      NEW.revoked_at := OLD.revoked_at;
      NEW.revoked_reason := OLD.revoked_reason;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_canonicalize_reuse_transition
  BEFORE UPDATE OF reuse_detected_at ON identity.sessions
  FOR EACH ROW EXECUTE FUNCTION identity.canonicalize_session_reuse_transition();

COMMENT ON FUNCTION identity.canonicalize_session_reuse_transition() IS
  'Requires replay evidence to reference an already-committed rotation and canonicalizes generation revocation evidence.';
