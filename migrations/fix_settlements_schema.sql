-- 修复线上 settlements 表缺失字段
-- 问题：Supabase schema cache 中找不到 settlements.items 等列
-- 执行方式：在 Supabase SQL Editor 中执行

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS used_benefit_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 如果表是早期创建的，可能还缺少以下字段，一并补齐
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS booking_id TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS processed_by TEXT;

-- 确保 created_at 有默认值
ALTER TABLE settlements
  ALTER COLUMN created_at SET DEFAULT NOW();

-- 常用索引
CREATE INDEX IF NOT EXISTS idx_settlements_shop_id ON settlements(shop_id);
CREATE INDEX IF NOT EXISTS idx_settlements_customer_id ON settlements(customer_id);
CREATE INDEX IF NOT EXISTS idx_settlements_created_at ON settlements(created_at DESC);
