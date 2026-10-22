import type {SetupConnection} from '../setup-db.js';

/** 执行035前读取真实字段；缺失时停止，不猜字段或自动改已有列。 */
export async function checkOperationsSchema(connection: SetupConnection) {
  const required: Record<string,string[]>={
    refund_requests:['id','shop_id','booking_id','customer_id','customer_name','amount','reason','status','created_at'],
    bookings:['id','shop_id','customer_id'],
    shops:['id','services','stockholder_config'],
    settlements:['id','shop_id','customer_id','booking_id','payment_status','total'],
    group_buy_vouchers:['id','batch_id','shop_id','code','status','platform','used_order_id'],
    group_buy_batches:['id','shop_id','platform','total_quantity','used_quantity','updated_at'],
    referral_records:['id','shop_id','referrer_id','referrer_name','referred_id','referred_name','referred_phone','status','confirmed_at','bonus_amount','first_spent_amount','source_booking_id'],
    stockholder_benefit_records:['id','shop_id','customer_id','type','amount','source_booking_id','status'],
    customers:['is_stockholder','stockholder_since','withdrawable_referral_amount','referral_earnings','referral_bonus_rate','is_referred','referrer_phone','name','phone','id','shop_id','balance','stored_value_balance','purchase_vip_level','purchase_vip_expires_at','stored_value_level','stored_value_expires_at','has_recharged','recharge_level','is_member','membership_level','updated_at'],
    membership_enrollments:['id','shop_id','customer_id','level','source','activity_type','package_id','enrolled_at','expires_at','status','note','revoked_at','revoked_by','revoked_by_name','updated_at'],
    member_benefit_records:['id','shop_id','customer_id','type','name','description','status','granted_at','granted_by','expires_at'],
    customer_packages:['id','shop_id','customer_id','name','service_id','total_times','used_times','price','expires_at','allow_holiday_use','status','source','activity_type'],
    stored_value_transactions:['id','customer_id','type','amount','balance_after','referral_portion','note','created_at','created_by'],
    product_orders:['id','shop_id','status','payment_status','shipping_company','shipping_no','shipped_at','updated_at'],
    shipment_tracking:['order_id','shipping_company','shipping_no','event_time','event_description','location'],
  };
  const result=await connection.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[Object.keys(required)]);
  const present=new Set(result.rows.map(r=>r.table_name+'.'+r.column_name));
  const missing=Object.entries(required).flatMap(([table,columns])=>columns.filter(column=>!present.has(table+'.'+column)).map(column=>table+'.'+column));
  if(missing.length) throw new Error('035历史结构不完整，停止升级：'+missing.join(', '));
}
