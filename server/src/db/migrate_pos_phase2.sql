-- POS phase 2: credit controls, supplier lead times, and reporting indexes.
-- This migration must remain idempotent: it has to run safely on fresh databases
-- and on databases that already completed phase 1.

-- 1) Credit limits and repayment terms.
ALTER TABLE shop_customers
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE shop_customers
ADD COLUMN IF NOT EXISTS credit_terms_days INTEGER NOT NULL DEFAULT 7;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_customers_credit_limit_check') THEN
    ALTER TABLE shop_customers
    ADD CONSTRAINT shop_customers_credit_limit_check CHECK (credit_limit >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_customers_credit_terms_check') THEN
    ALTER TABLE shop_customers
    ADD CONSTRAINT shop_customers_credit_terms_check CHECK (credit_terms_days BETWEEN 1 AND 365);
  END IF;
END $$;

-- 2) Supplier lead times for replenishment suggestions.
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 3;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_lead_time_check') THEN
    ALTER TABLE suppliers
    ADD CONSTRAINT suppliers_lead_time_check CHECK (lead_time_days BETWEEN 0 AND 90);
  END IF;
END $$;

-- 3) Indexes for credit aging, replenishment velocity, and date-range reports.
CREATE INDEX IF NOT EXISTS idx_sales_customer_created
ON sales(customer_id, created_at)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_created
ON sales(created_at);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale
ON sale_items(sale_id);

CREATE INDEX IF NOT EXISTS idx_activity_credit_payment_customer
ON activity_log(entity_id, created_at)
WHERE action = 'credit.payment';

CREATE INDEX IF NOT EXISTS idx_expenses_date_status_type
ON expenses(date, status, type);
