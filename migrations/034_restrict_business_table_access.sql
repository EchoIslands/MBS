-- 2026-10-22：只读元数据确认 product_orders/product_order_items/products 的
-- Allow all 策略允许绕过API。三端只经后端service_role访问，无直接Supabase查询。
-- 仅收紧本项目明确业务表；不删除/更新业务记录，不更改其他schema。
DO $$
DECLARE item TEXT; column_item TEXT;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'bookings','coupons','customer_auth_limits','customer_coupons','customer_events','customer_packages',
    'customer_password_initialization_runs','customer_profiles','customer_visit_records','customers','employees',
    'group_buy_batches','group_buy_vouchers','member_benefit_records','member_benefits','membership_enrollments',
    'package_usage_logs','payments','product_inventory_logs','product_order_items','product_order_refunds','product_orders',
    'products','purchase_vip_configs','queues','referral_records','refund_requests','reviews','satisfaction_surveys',
    'services','settlement_items','settlement_package_reservations','settlements','shipment_tracking','shop_vip_configs',
    'shops','special_vip_configs','stockholder_benefit_records','stored_value_configs','stored_value_transactions','withdrawal_requests'
  ] LOOP
    IF to_regclass('public.'||item) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated',item);
      -- 表级撤权不会自动清除历史的列级授权。
      FOR column_item IN SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid=to_regclass('public.'||item) AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL LOOP
        EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated',column_item,column_item,column_item,column_item,item);
      END LOOP;
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role',item);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item);
    END IF;
  END LOOP;
  FOREACH item IN ARRAY ARRAY['products','product_orders','product_order_items'] LOOP
    IF to_regclass('public.'||item) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I',item);
    END IF;
  END LOOP;
END $$;
