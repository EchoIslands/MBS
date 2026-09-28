-- 店铺会员权益自定义配置表
-- 支持购买型 VIP、储值会员、CEO 特殊 VIP 的自定义配置
CREATE TABLE IF NOT EXISTS shop_vip_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  config_type TEXT NOT NULL CHECK (config_type IN ('purchase', 'stored', 'special')),
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, config_type, config_key)
);

CREATE INDEX IF NOT EXISTS idx_shop_vip_configs_shop ON shop_vip_configs(shop_id, config_type);

COMMENT ON TABLE shop_vip_configs IS '店铺会员权益自定义配置（购买型 VIP / 储值会员 / CEO 特殊 VIP）';
