-- 023：employees 表增加「是否为金牌发型师」字段
-- 用于区分金牌发型师与普通发型师，前端字段 isGoldStylist -> 数据库列 is_gold_stylist
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_gold_stylist BOOLEAN DEFAULT FALSE;