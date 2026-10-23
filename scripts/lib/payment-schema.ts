import type { SetupConnection } from '../setup-db.js';

export async function checkPaymentSchema(connection:SetupConnection) {
  const columns=await connection.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('payments','settlements')");
  const required:Record<string,Record<string,string>>={
    payments:{id:'text',shop_id:'text',customer_id:'text',settlement_id:'text',channel:'text',amount:'numeric',status:'text',transaction_id:'text',paid_at:'timestamp with time zone',created_at:'timestamp with time zone'},
    settlements:{id:'text',shop_id:'text',customer_id:'text',payment_method:'text',payment_status:'text',total:'numeric',created_at:'timestamp with time zone',customer_package_id:'text',booking_id:'text'},
  };
  for(const [table,fields] of Object.entries(required)) for(const [column,type] of Object.entries(fields)) {
    if(!columns.rows.some(row=>row.table_name===table && row.column_name===column && row.data_type===type)) throw new Error('支付结构预检不通过：'+table+'.'+column+'；未安装037，不能猜测或替换已有字段');
  }
  const source=columns.rows.find(row=>row.table_name==='payments' && row.column_name==='paid_at_source');
  if(source && source.data_type!=='text') throw new Error('支付结构预检不通过：payments.paid_at_source类型不兼容');
  const base=await connection.query("SELECT to_regprocedure('public.finalize_settlement_atomic(text,text,text,text,text,text,text)') AS finalizer");
  if(!base.rows[0]?.finalizer) throw new Error('缺少结算基础函数，先核对027/031迁移');
}
