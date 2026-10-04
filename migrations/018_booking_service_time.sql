-- 预约支持记录实际服务起止时间，并允许预约时间与实际服务时间分离
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMPTZ;
