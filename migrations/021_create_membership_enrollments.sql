-- 会员入会记录表：每次入会（含活动自动入会）写一条，用于留痕入会时间与统计入会次数
CREATE TABLE IF NOT EXISTS membership_enrollments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  activity_type TEXT,
  package_id TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_by_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_enrollments_customer ON membership_enrollments(customer_id);
CREATE INDEX IF NOT EXISTS idx_membership_enrollments_shop ON membership_enrollments(shop_id);
CREATE INDEX IF NOT EXISTS idx_membership_enrollments_status ON membership_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_membership_enrollments_enrolled ON membership_enrollments(enrolled_at);

-- 次卡表增加活动类型字段（用于识别「99元3次」等自动入会活动，禁止按名称/价格字符串判断）
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS activity_type TEXT;
