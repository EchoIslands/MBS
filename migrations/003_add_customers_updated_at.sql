-- 为客户表补充 updated_at 字段，保持与代码中其他表一致的更新习惯
alter table customers add column if not exists updated_at timestamptz default now();

-- 可选：为已有数据初始化 updated_at 为 created_at
update customers set updated_at = created_at where updated_at is null;
