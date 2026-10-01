-- ========== 补齐优惠券表扩展字段（与后端代码及 shared/types.ts 保持一致）==========
-- 背景：001_baseline_schema.sql 中的 coupons 表为简化结构，缺少后端代码已使用的字段，
-- 导致创建/领取优惠券（含邀请二维码新人券）时插入失败。
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS applicable_scope TEXT,
  ADD COLUMN IF NOT EXISTS applicable_product_ids TEXT[],
  ADD COLUMN IF NOT EXISTS total_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS remaining_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER;

-- 为已有记录填充默认值，避免后续查询/校验出现 NULL
UPDATE coupons
SET
  start_at = COALESCE(start_at, created_at),
  updated_at = COALESCE(updated_at, created_at),
  applicable_scope = COALESCE(applicable_scope, 'all'),
  applicable_product_ids = COALESCE(applicable_product_ids, '{}'),
  total_quantity = COALESCE(total_quantity, -1),
  remaining_quantity = COALESCE(remaining_quantity, -1),
  per_customer_limit = COALESCE(per_customer_limit, 1)
WHERE start_at IS NULL
   OR updated_at IS NULL
   OR applicable_scope IS NULL
   OR applicable_product_ids IS NULL
   OR total_quantity IS NULL
   OR remaining_quantity IS NULL
   OR per_customer_limit IS NULL;

-- ========== 补齐顾客优惠券表扩展字段（与后端代码及 shared/types.ts 保持一致）==========
-- 背景：001_baseline_schema.sql 中的 customer_coupons 表缺少 customer_name/customer_phone/updated_at/order_id，
-- 导致 /referrals/claim 和 /coupons/:id/claim 插入时失败。
ALTER TABLE customer_coupons
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS order_id TEXT;

UPDATE customer_coupons
SET
  updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;
