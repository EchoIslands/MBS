import type { SetupConnection } from '../setup-db.js';

/** 只读核对已有列；044只允许补上022的last_stylist，不修正不兼容类型。 */
export async function checkCustomerServiceSchema(connection: SetupConnection) {
  const result = await connection.query("SELECT table_name,column_name,data_type,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])", [['customers','customer_visit_records','settlements']]);
  const expected: Record<string, Record<string,string>> = {
    customers: {id:'text',shop_id:'text',last_stylist:'text',last_visit_at:'timestamptz',last_service_items:'_text'},
    customer_visit_records: {id:'text',customer_id:'text',shop_id:'text',check_in_time:'timestamptz',stylist_name:'text',service_names:'_text'},
    settlements: {id:'text',customer_id:'text',shop_id:'text',payment_status:'text',items:'jsonb'},
  };
  for(const [table,fields] of Object.entries(expected)) for(const [column,type] of Object.entries(fields)) {
    const actual=result.rows.find(row=>row.table_name===table && row.column_name===column);
    if(!actual && table==='customers' && column==='last_stylist') continue;
    if(!actual || actual.udt_name!==type) throw new Error('044 上次服务结构预检失败：'+table+'.'+column+' 缺失或类型不兼容；请核对历史结构。');
  }
}
