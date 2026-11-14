-- Credential lifecycle validity is evaluated at the instant an operation executes, not at the
-- start of a potentially long or lock-waiting transaction. Preserve the checksum-locked trigger
-- bodies from 000004 and replace only their transaction-start clock reads.

DO $$
DECLARE
  binding_definition text;
  topology_definition text;
  transaction_clock constant text := 'transaction_timestamp()';
  wall_clock constant text := 'clock_timestamp()';
  binding_occurrences integer;
  topology_occurrences integer;
BEGIN
  SELECT pg_get_functiondef(
    to_regprocedure('identity.enforce_session_family_binding()')
  ) INTO binding_definition;
  SELECT pg_get_functiondef(
    to_regprocedure('identity.enforce_active_session_family_topology()')
  ) INTO topology_definition;

  IF binding_definition IS NULL OR topology_definition IS NULL THEN
    RAISE EXCEPTION 'required identity session guard function is missing';
  END IF;

  binding_occurrences := (
    char_length(binding_definition)
      - char_length(replace(binding_definition, transaction_clock, ''))
  ) / char_length(transaction_clock);
  topology_occurrences := (
    char_length(topology_definition)
      - char_length(replace(topology_definition, transaction_clock, ''))
  ) / char_length(transaction_clock);

  IF binding_occurrences <> 5 OR topology_occurrences <> 1 THEN
    RAISE EXCEPTION
      'identity session guard functions differ from the expected 000004 definitions';
  END IF;

  EXECUTE replace(binding_definition, transaction_clock, wall_clock);
  EXECUTE replace(topology_definition, transaction_clock, wall_clock);
END;
$$;

COMMENT ON FUNCTION identity.enforce_session_family_binding() IS
  'Protects immutable session lineage and evaluates issuance, rotation, reuse, and expiry against wall-clock time.';

COMMENT ON FUNCTION identity.enforce_active_session_family_topology() IS
  'Validates one complete active lineage per family using wall-clock expiry at deferred constraint time.';
