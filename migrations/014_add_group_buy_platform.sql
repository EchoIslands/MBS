-- 为已部署的外部团购券表补充 platform 字段
-- 执行时机：在 Supabase SQL Editor 中运行

ALTER TABLE group_buy_batches
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'other'
CHECK (platform IN ('meituan', 'douyin', 'dianping', 'other'));

ALTER TABLE group_buy_vouchers
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'other'
CHECK (platform IN ('meituan', 'douyin', 'dianping', 'other'));

-- 可选：为 platform 增加索引，方便按平台统计
CREATE INDEX IF NOT EXISTS idx_group_buy_batches_platform ON group_buy_batches(shop_id, platform);
CREATE INDEX IF NOT EXISTS idx_group_buy_vouchers_platform ON group_buy_vouchers(shop_id, platform);
