-- 团购券批次表
CREATE TABLE IF NOT EXISTS group_buy_batches (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_ids TEXT[] NOT NULL DEFAULT '{}',
  service_prices JSONB NOT NULL DEFAULT '{}',
  price_type TEXT NOT NULL DEFAULT 'fixed',
  fixed_price NUMERIC(10,2),
  vip_level TEXT,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  used_quantity INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 团购券实例表
CREATE TABLE IF NOT EXISTS group_buy_vouchers (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES group_buy_batches(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'revoked')),
  used_at TIMESTAMP WITH TIME ZONE,
  used_by_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  used_order_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shop_id, code)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_group_buy_vouchers_code ON group_buy_vouchers(shop_id, code);
CREATE INDEX IF NOT EXISTS idx_group_buy_vouchers_batch_id ON group_buy_vouchers(batch_id);
CREATE INDEX IF NOT EXISTS idx_group_buy_batches_shop_id ON group_buy_batches(shop_id);

-- 更新已用数量函数
CREATE OR REPLACE FUNCTION update_group_buy_batch_used_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'used' AND OLD.status = 'unused' THEN
    UPDATE group_buy_batches
    SET used_quantity = used_quantity + 1, updated_at = NOW()
    WHERE id = NEW.batch_id;
  ELSIF NEW.status = 'unused' AND OLD.status = 'used' THEN
    UPDATE group_buy_batches
    SET used_quantity = used_quantity - 1, updated_at = NOW()
    WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_batch_used_quantity ON group_buy_vouchers;
CREATE TRIGGER trg_update_batch_used_quantity
AFTER UPDATE ON group_buy_vouchers
FOR EACH ROW
EXECUTE FUNCTION update_group_buy_batch_used_quantity();
