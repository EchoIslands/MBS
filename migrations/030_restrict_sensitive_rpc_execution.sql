-- 仅收紧本项目敏感 RPC，不改业务数据、函数体或全库默认权限。
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.begin_customer_auth_attempt(text)',
    'public.finish_customer_auth_attempt(text,boolean)',
    'public.finalize_settlement_atomic(text,text,text,text,text,text,text)',
    'public.consume_customer_package_atomic(text,text,text,text,text)',
    'public.create_settlement_atomic(jsonb,text,text,boolean)',
    'public.delete_settlement_draft_atomic(text,text)',
    'public.pay_product_order_atomic(text,text)',
    'public.create_product_order_atomic(jsonb,jsonb,text)',
    'public.handle_product_refund_atomic(text,text,text,text,text,text)',
    'public.cancel_product_order_atomic(text,text,text,text)'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN RAISE EXCEPTION 'RPC_MISSING: %', signature; END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
    IF has_function_privilege('anon', target, 'EXECUTE')
       OR has_function_privilege('authenticated', target, 'EXECUTE')
       OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
      RAISE EXCEPTION 'RPC_EFFECTIVE_PERMISSION_INVALID: %', signature;
    END IF;
  END LOOP;
END $$;
COMMIT;
