-- 024：bookings 表增加「预约延时」相关字段
-- 用于发型师临时增项延时后，标记后续受影响的预约并支持顾客改时间
-- delay_state: null 正常 / needs_action 待处理 / no_response 超时未响应 / rescheduled 已改时间 / reassigned(预留 v2)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_state TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_expected_end TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_created_at TIMESTAMPTZ;