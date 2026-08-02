-- 迁移：将 reviews 表中的评分字段从 integer 改为 numeric(2,1)，支持半星评分
-- 执行时机：2026-08-03 评价系统半星精度修复后
-- 注意：线上已存在 reviews 表时执行；新环境通过 schema.sql 已包含此类型，无需重复执行

alter table reviews
  alter column rating type numeric(2,1) using rating::numeric(2,1),
  alter column service_score type numeric(2,1) using service_score::numeric(2,1),
  alter column price_score type numeric(2,1) using price_score::numeric(2,1),
  alter column skill_score type numeric(2,1) using skill_score::numeric(2,1),
  alter column stylist_score type numeric(2,1) using stylist_score::numeric(2,1),
  alter column overall_score type numeric(2,1) using overall_score::numeric(2,1);
