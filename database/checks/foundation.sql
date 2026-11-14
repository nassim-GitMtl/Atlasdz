SELECT
  (SELECT count(*) FROM platform.schema_migrations) AS applied_migrations,
  (SELECT count(*) FROM platform.feature_flag_versions WHERE is_current) AS current_feature_flags,
  (SELECT count(*) FROM platform.outbox_events WHERE published_at IS NULL) AS pending_outbox_events,
  (SELECT count(*) FROM platform.inbox_messages WHERE status IN ('RECEIVED', 'FAILED')) AS retryable_inbox_messages;
