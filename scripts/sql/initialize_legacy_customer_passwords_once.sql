-- 手动、一次性数据操作。先在隔离项目验收 025–029，发布强制改密客户端/服务端后再执行。
-- 本仓库不会自动执行此脚本；只返回影响数量，不导出客户信息或密码哈希。
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $init$
DECLARE
  crypto_schema text;
  inserted_count bigint;
  updated_count bigint;
BEGIN
  INSERT INTO public.customer_password_initialization_runs(run_key)
    VALUES ('legacy-empty-passwords-123456-v1') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    RAISE NOTICE '初始化已执行，跳过；未修改任何客户';
    RETURN;
  END IF;
  SELECT n.nspname INTO STRICT crypto_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
  -- gen_salt 每行独立调用；bf 为 bcrypt，cost=12，与服务端保持一致。
  EXECUTE format('UPDATE public.customers
    SET password_hash = %1$I.crypt(''123456'', %1$I.gen_salt(''bf'', 12)),
        is_weak_password = true, password_reset_at = now(),
        identity_verified = false, identity_verified_at = NULL, identity_verified_by = NULL
    WHERE password_hash IS NULL OR btrim(password_hash) = ''''', crypto_schema);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  UPDATE public.customer_password_initialization_runs SET affected_count=updated_count
    WHERE run_key='legacy-empty-passwords-123456-v1';
  RAISE NOTICE '初始化完成，影响客户数：%', updated_count;
END;
$init$;
COMMIT;
SELECT run_key, executed_at, affected_count FROM public.customer_password_initialization_runs
  WHERE run_key='legacy-empty-passwords-123456-v1';
