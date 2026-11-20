-- 061_queue_display_account.sql
-- 店内显示屏使用独立员工账号。该角色只能读取实时排队状态，不能通过常规接口修改队列。
-- 发型师在显示屏上的快捷操作仍须再次输入自己的员工登录密码，由服务端以本人身份调用既有原子 RPC。
-- 不增加 role CHECK，兼容已有历史员工数据和后续角色扩展。
CREATE INDEX IF NOT EXISTS employees_queue_display_shop_idx
  ON public.employees(shop_id, role, is_active)
  WHERE role = 'queue_display';

COMMENT ON INDEX employees_queue_display_shop_idx IS '用于店内显示屏专用只读账号的门店查询';
