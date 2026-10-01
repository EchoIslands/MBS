-- 允许优惠券模板没有固定结束时间（选择"不限时间"）
ALTER TABLE coupons ALTER COLUMN end_at DROP NOT NULL;
