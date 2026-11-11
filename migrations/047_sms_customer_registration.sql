-- Resolve only after server-side OTP verification. No public registration RPC.
CREATE OR REPLACE FUNCTION public.resolve_sms_customer(p_phone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids text[]; new_id text;
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^1[3-9][0-9]{9}$' THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;
  -- Serializes concurrent SMS registrations for the same phone.
  PERFORM pg_advisory_xact_lock(hashtextextended('sms-registration:' || p_phone, 0));
  SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.customers WHERE phone=p_phone LIMIT 2) c;
  IF cardinality(ids)>1 THEN RAISE EXCEPTION 'AMBIGUOUS_CUSTOMER'; END IF;
  IF cardinality(ids)=1 THEN RETURN ids[1]; END IF;
  -- MBS currently has one public storefront; never accept shop/financial fields from callers.
  IF NOT EXISTS (SELECT 1 FROM public.shops WHERE id='shop1') THEN RAISE EXCEPTION 'SHOP_UNAVAILABLE'; END IF;
  new_id := 'cust_' || gen_random_uuid()::text;
  INSERT INTO public.customers(id,shop_id,name,phone,source,identity_verified,is_weak_password)
    VALUES(new_id,'shop1','新顾客',p_phone,'sms_registration',false,false);
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.resolve_sms_customer(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sms_customer(text) TO service_role;
