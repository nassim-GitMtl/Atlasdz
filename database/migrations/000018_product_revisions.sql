-- Keep immutable proposals as a linear, staff-approved history of each product.
ALTER TABLE catalog.product_submissions
  DROP CONSTRAINT product_submissions_product_id_key,
  ADD COLUMN revision_of_submission_id uuid,
  ADD CONSTRAINT product_submission_owner_key UNIQUE (id, seller_id),
  ADD CONSTRAINT product_revision_owner_fk FOREIGN KEY (revision_of_submission_id, seller_id)
    REFERENCES catalog.product_submissions(id, seller_id) ON DELETE RESTRICT,
  ADD CONSTRAINT product_revision_not_self CHECK (revision_of_submission_id <> id);

CREATE UNIQUE INDEX product_original_submission_idx ON catalog.product_submissions(product_id)
  WHERE revision_of_submission_id IS NULL;
CREATE UNIQUE INDEX product_approved_revision_idx ON catalog.product_submissions(revision_of_submission_id)
  WHERE status = 'APPROVED';
CREATE UNIQUE INDEX product_pending_revision_idx ON catalog.product_submissions(revision_of_submission_id)
  WHERE status = 'PENDING_REVIEW';
CREATE INDEX product_revision_history_idx ON catalog.product_submissions(revision_of_submission_id);
