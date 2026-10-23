-- Capture employee-entered cash/card occurrence time and database recording time atomically.
-- This migration deliberately does not backfill historical settlements.
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS manual_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_paid_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_paid_recorded_by TEXT;

CREATE OR REPLACE FUNCTION public.capture_manual_settlement_payment_time()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE requested_at TEXT; employee_id TEXT; captured_at TIMESTAMPTZ;
BEGIN
  IF OLD.payment_status='completed' AND NEW.payment_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'COMPLETED_SETTLEMENT_IMMUTABLE';
  END IF;
  IF OLD.payment_status='completed' AND (
    NEW.manual_paid_at IS DISTINCT FROM OLD.manual_paid_at OR
    NEW.manual_paid_recorded_at IS DISTINCT FROM OLD.manual_paid_recorded_at OR
    NEW.manual_paid_recorded_by IS DISTINCT FROM OLD.manual_paid_recorded_by
  ) THEN RAISE EXCEPTION 'COMPLETED_PAYMENT_TIME_IMMUTABLE'; END IF;

  IF NEW.payment_status='completed' AND OLD.payment_status IS DISTINCT FROM 'completed'
     AND NEW.payment_method IN ('cash','card','balance') THEN
    employee_id := NULLIF(current_setting('mbs.payment_employee_id', TRUE), '');
    IF NEW.payment_method='balance' THEN
      -- Balance consumption is an actual DB ledger write; never accept a client-selected time.
      NEW.manual_paid_at := clock_timestamp();
    ELSE
      requested_at := NULLIF(current_setting('mbs.manual_paid_at', TRUE), '');
      IF requested_at IS NOT NULL THEN
        BEGIN captured_at := requested_at::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT_TIME'; END;
        IF NOT isfinite(captured_at) OR captured_at > clock_timestamp() + INTERVAL '5 minutes' THEN
          RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT_TIME';
        END IF;
        NEW.manual_paid_at := captured_at;
      ELSE
        NEW.manual_paid_at := clock_timestamp();
      END IF;
    END IF;
    NEW.manual_paid_recorded_at := clock_timestamp();
    NEW.manual_paid_recorded_by := employee_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS capture_manual_settlement_payment_time ON public.settlements;
CREATE TRIGGER capture_manual_settlement_payment_time
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.capture_manual_settlement_payment_time();

-- Preserve the established atomic checkout implementation; pass the optional time only
-- through transaction-local settings that the trigger consumes at successful completion.
CREATE OR REPLACE FUNCTION public.create_settlement_with_manual_time_atomic(
  p_settlement JSONB, p_employee_id TEXT, p_employee_name TEXT, p_complete BOOLEAN, p_manual_paid_at TIMESTAMPTZ
) RETURNS SETOF public.settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_settlement->>'payment_method' NOT IN ('cash','card','balance','wechat','alipay') THEN
    RAISE EXCEPTION 'UNSUPPORTED_PAYMENT_METHOD';
  END IF;
  IF p_settlement->>'payment_method' NOT IN ('cash','card') AND p_manual_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'MANUAL_TIME_ONLY_FOR_CASH_OR_CARD';
  END IF;
  IF p_manual_paid_at IS NOT NULL AND (NOT isfinite(p_manual_paid_at) OR p_manual_paid_at > clock_timestamp()+INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT_TIME';
  END IF;
  PERFORM set_config('mbs.payment_employee_id',COALESCE(p_employee_id,''),TRUE);
  PERFORM set_config('mbs.manual_paid_at',CASE WHEN p_settlement->>'payment_method' IN ('cash','card') THEN COALESCE(p_manual_paid_at::TEXT,'') ELSE '' END,TRUE);
  RETURN QUERY SELECT * FROM public.create_settlement_atomic(p_settlement,p_employee_id,p_employee_name,p_complete);
END $$;

CREATE OR REPLACE FUNCTION public.finalize_settlement_with_manual_time_atomic(
  p_settlement_id TEXT, p_shop_id TEXT, p_employee_id TEXT, p_employee_name TEXT,
  p_booking_id TEXT, p_package_id TEXT, p_package_note TEXT, p_manual_paid_at TIMESTAMPTZ
) RETURNS SETOF public.settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE method TEXT;
BEGIN
  SELECT payment_method INTO method FROM public.settlements WHERE id=p_settlement_id AND shop_id=p_shop_id;
  IF method IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND'; END IF;
  IF method NOT IN ('cash','card','balance') AND p_manual_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'MANUAL_TIME_ONLY_FOR_CASH_OR_CARD';
  END IF;
  IF method='balance' AND p_manual_paid_at IS NOT NULL THEN RAISE EXCEPTION 'BALANCE_TIME_IS_DATABASE_CONTROLLED'; END IF;
  IF p_manual_paid_at IS NOT NULL AND (NOT isfinite(p_manual_paid_at) OR p_manual_paid_at > clock_timestamp()+INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT_TIME';
  END IF;
  PERFORM set_config('mbs.payment_employee_id',COALESCE(p_employee_id,''),TRUE);
  PERFORM set_config('mbs.manual_paid_at',CASE WHEN method IN ('cash','card') THEN COALESCE(p_manual_paid_at::TEXT,'') ELSE '' END,TRUE);
  RETURN QUERY SELECT * FROM public.finalize_settlement_atomic(
    p_settlement_id,p_shop_id,p_employee_id,p_employee_name,p_booking_id,p_package_id,p_package_note
  );
END $$;

REVOKE ALL ON FUNCTION public.capture_manual_settlement_payment_time() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_manual_settlement_payment_time() TO service_role;
REVOKE ALL ON FUNCTION public.create_settlement_with_manual_time_atomic(JSONB,TEXT,TEXT,BOOLEAN,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement_with_manual_time_atomic(JSONB,TEXT,TEXT,BOOLEAN,TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_settlement_with_manual_time_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_settlement_with_manual_time_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO service_role;
