-- Questions before buying: a signed-in customer asks on a product page (shown anonymously);
-- sellers offering the product answer (one answer each); staff can hide a question.
CREATE TABLE catalog.product_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 5 AND 500),
  status text COLLATE "C" NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX product_questions_product_idx ON catalog.product_questions (product_id, created_at DESC);
CREATE INDEX product_questions_customer_idx ON catalog.product_questions (customer_id, created_at DESC);

CREATE TABLE catalog.product_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES catalog.product_questions (id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers.sellers (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (question_id, seller_id)
);
