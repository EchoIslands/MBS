BEGIN;

CREATE OR REPLACE FUNCTION public.protect_business_record_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'BUSINESS_RECORD_DELETE_BLOCKED';
END $$;

DROP TRIGGER IF EXISTS protect_customer_delete ON public.customers;
CREATE TRIGGER protect_customer_delete BEFORE DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.protect_business_record_delete();

DROP TRIGGER IF EXISTS protect_shop_delete ON public.shops;
CREATE TRIGGER protect_shop_delete BEFORE DELETE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.protect_business_record_delete();

DROP TRIGGER IF EXISTS protect_paid_settlement_delete ON public.settlements;
CREATE TRIGGER protect_paid_settlement_delete BEFORE DELETE ON public.settlements
  FOR EACH ROW WHEN (OLD.payment_status IN ('paid', 'completed'))
  EXECUTE FUNCTION public.protect_business_record_delete();

DROP TRIGGER IF EXISTS protect_payment_delete ON public.payments;
CREATE TRIGGER protect_payment_delete BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_business_record_delete();

DROP TRIGGER IF EXISTS protect_wallet_transaction_delete ON public.stored_value_transactions;
CREATE TRIGGER protect_wallet_transaction_delete BEFORE DELETE ON public.stored_value_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_business_record_delete();

-- TRUNCATE (including CASCADE) does not fire row DELETE triggers.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shops', 'customers', 'settlements', 'payments', 'stored_value_transactions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS protect_business_record_truncate ON public.%I', t);
    EXECUTE format('CREATE TRIGGER protect_business_record_truncate BEFORE TRUNCATE ON public.%I
      FOR EACH STATEMENT EXECUTE FUNCTION public.protect_business_record_delete()', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.protect_business_record_delete() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS moderation_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.begin_customer_password_account_attempt(p_account_hash text)
RETURNS TABLE(allowed boolean, retry_after_seconds integer, reason text, attempt_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.begin_customer_auth_attempt_v2(p_account_hash);
$$;
REVOKE ALL ON FUNCTION public.begin_customer_password_account_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_customer_password_account_attempt(text) TO service_role;

COMMIT;
