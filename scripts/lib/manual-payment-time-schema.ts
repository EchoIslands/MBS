import type { SetupConnection } from '../setup-db.js';

export async function checkManualPaymentTimeSchema(connection: SetupConnection) {
  const columns = await connection.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'");
  for (const [column, type] of Object.entries({
    id: 'text', shop_id: 'text', payment_method: 'text', payment_status: 'text', total: 'numeric',
    manual_paid_at: 'timestamp with time zone', manual_paid_recorded_at: 'timestamp with time zone', manual_paid_recorded_by: 'text',
  })) {
    const actual = columns.rows.find(row => row.column_name === column);
    if (actual && actual.data_type !== type) throw new Error('039 付款时间结构预检失败：settlements.' + column + ' 类型不兼容；不自动改写已有字段。');
  }
  for (const [signature, label] of [
    ['public.create_settlement_atomic(jsonb,text,text,boolean)', '027/031 原子结算函数'],
    ['public.finalize_settlement_atomic(text,text,text,text,text,text,text)', '027 原子完成函数'],
  ]) {
    const result = await connection.query('SELECT to_regprocedure($1)::text AS name', [signature]);
    if (!result.rows[0]?.name) throw new Error('039 付款时间结构预检失败：缺少' + label + '。');
  }
}
