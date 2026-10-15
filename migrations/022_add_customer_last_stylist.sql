-- 022：customers 表增加「上次服务设计师」字段
-- 修复店铺端编辑客户时「上次服务设计师」保存后丢失的问题
-- 前端字段 lastStylist -> 数据库列 last_stylist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_stylist TEXT;