-- A request records a conversation, not eligibility, a refund, a shipment or stock movement.
CREATE TABLE commerce.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL UNIQUE REFERENCES commerce.seller_orders(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('RETURN_REQUEST','DELIVERY_ISSUE','OTHER')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WAITING_CUSTOMER','ESCALATED','RESOLVED')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX support_cases_updated_idx ON commerce.support_cases(updated_at DESC,id);
CREATE TABLE commerce.support_messages (
  case_id uuid NOT NULL REFERENCES commerce.support_cases(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  actor_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('customer','seller_user','staff')),
  action text NOT NULL CHECK (action IN ('OPEN','REPLY','ESCALATE','CONFIRM_RESOLUTION','STAFF_RESOLVE')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 5 AND 2000),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(case_id,version),
  UNIQUE(case_id,request_id)
);
CREATE FUNCTION commerce.protect_support_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='support_messages' THEN RAISE EXCEPTION 'Support history is immutable'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.seller_order_id IS DISTINCT FROM OLD.seller_order_id
    OR NEW.category IS DISTINCT FROM OLD.category OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.row_version <> OLD.row_version+1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Invalid support version or identity change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_support_messages BEFORE UPDATE OR DELETE ON commerce.support_messages FOR EACH ROW EXECUTE FUNCTION commerce.protect_support_history();
CREATE TRIGGER support_case_lifecycle BEFORE UPDATE OR DELETE ON commerce.support_cases FOR EACH ROW EXECUTE FUNCTION commerce.protect_support_history();
CREATE FUNCTION commerce.check_support_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE case_key uuid; current_case commerce.support_cases%ROWTYPE; latest commerce.support_messages%ROWTYPE; message_count bigint;
BEGIN
  IF TG_TABLE_NAME='support_cases' THEN case_key := NEW.id; ELSE case_key := NEW.case_id; END IF;
  SELECT * INTO STRICT current_case FROM commerce.support_cases WHERE id=case_key;
  SELECT * INTO latest FROM commerce.support_messages WHERE case_id=case_key AND version=current_case.row_version;
  SELECT count(*) INTO message_count FROM commerce.support_messages WHERE case_id=case_key;
  IF latest.case_id IS NULL OR message_count <> current_case.row_version THEN RAISE EXCEPTION 'Support history must match case version'; END IF;
  IF (current_case.status='OPEN' AND NOT (latest.actor_type='customer' AND latest.action IN ('OPEN','REPLY')))
    OR (current_case.status='WAITING_CUSTOMER' AND NOT (latest.actor_type='seller_user' AND latest.action='REPLY'))
    OR (current_case.status='ESCALATED' AND NOT (latest.action='REPLY' OR (latest.action='ESCALATE' AND latest.actor_type='customer')))
    OR (current_case.status='RESOLVED' AND NOT ((latest.action='CONFIRM_RESOLUTION' AND latest.actor_type='customer') OR (latest.action='STAFF_RESOLVE' AND latest.actor_type='staff'))) THEN
    RAISE EXCEPTION 'Support state requires attributed history';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER support_case_history_complete AFTER INSERT OR UPDATE ON commerce.support_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commerce.check_support_history();
CREATE CONSTRAINT TRIGGER support_message_history_complete AFTER INSERT ON commerce.support_messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commerce.check_support_history();
INSERT INTO identity.permissions(code,sensitivity,description) VALUES
  ('support.manage','STANDARD','Read and participate in own customer or scoped seller order support'),
  ('support.escalations','SENSITIVE','Read and resolve escalated order support as staff');
