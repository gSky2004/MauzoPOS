-- POS phase 3: simple debt tracking.
--
-- The credit-limit / repayment-terms model (phase 2) was too heavy for a small
-- shop. This phase adds what the owner actually needs: an optional due date and
-- the amount actually handed over at the time of a credit sale. The old
-- credit_limit / credit_terms_days columns are intentionally LEFT IN PLACE so
-- existing databases and rows keep working -- they are simply no longer read or
-- written by the application.
--
-- Must stay idempotent: safe on fresh databases and on ones already migrated.

-- 1) Optional due date for a credit sale. NULL means "no promise date", and a
--    debt without a due date is never reported as overdue.
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS due_date DATE;

-- 2) What the customer actually paid at the time of the credit sale. The debt
--    raised by the sale is (total - amount_paid). Storing it on the sale keeps
--    the down payment out of the payment ledger, so it can never be counted
--    twice.
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_amount_paid_check') THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_amount_paid_check CHECK (amount_paid >= 0);
  END IF;
END $$;

-- 3) Index for the debt list: only credit sales that still have a promise date.
CREATE INDEX IF NOT EXISTS idx_sales_credit_due
ON sales(due_date)
WHERE payment_method = 'Credit' AND due_date IS NOT NULL;