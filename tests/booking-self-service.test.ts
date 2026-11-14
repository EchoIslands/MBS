import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE shops(id text PRIMARY KEY,services jsonb);
 CREATE TABLE customers(id text PRIMARY KEY,shop_id text,phone text);
 CREATE TABLE employees(id text PRIMARY KEY,shop_id text,role text,is_active boolean);
 CREATE TABLE bookings(id text PRIMARY KEY,shop_id text,customer_id text,customer_name text,customer_phone text,stylist_id text,stylist_name text,service_id text,service_name text,price numeric,scheduled_time timestamptz,scheduled_end_time timestamptz,queue_number integer,status text,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz,actual_start_time timestamptz,arrived_at timestamptz,queue_state text,delay_state text);
 INSERT INTO shops VALUES('s','[{"id":"svc","duration":30}]');
 INSERT INTO customers VALUES('c','s','13800000001'),('samephone','s','13800000001'),('other','s','13800000002');
 INSERT INTO employees VALUES('manager','s','shop_manager',true),('front','s','customer_service',true),('stylist','s','stylist',true),('outsider','x','shop_manager',true);`);
 await db.exec(await readFile(new URL('../migrations/055_booking_self_service_and_attendance.sql',import.meta.url),'utf8'));
 const at=(days:number,hour=10)=>`(date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Shanghai')+interval '${days} days ${hour} hours') AT TIME ZONE 'Asia/Shanghai'`;
 const add=(id:string,day:number,customer='c',hour=10)=>db.query(`SELECT (create_booking_once(jsonb_build_object('id',$1::text,'shop_id','s','customer_id',$2::text,'service_id','svc','scheduled_time',${at(day,hour)},'status','confirmed','price',29,'booking_request_key',$1::text||'_unique_request_key'))).id`,[id,customer]);
 return {db,at,add};
}
test('reservations enforce phone identity, calendar horizon, rate/capacity and stable replay',async()=>{
 const {db,add}=await fixture();try{
 await add('a',1);await add('a',1);
 assert.equal((await db.query('SELECT * FROM bookings')).rows.length,1);
 await assert.rejects(add('b',1,'samephone',14),/BOOKING_DAILY_LIMIT/);
 await add('b',2);
 await assert.rejects(add('c',3),/BOOKING_ACTIVE_LIMIT/);
 await assert.rejects(add('far',15,'other'),/BOOKING_DATE_RANGE/);
 await add('other',1,'other');
 await db.exec("INSERT INTO customers VALUES('third','s','13800000003')");
 await assert.rejects(add('full',1,'third'),/BOOKING_CAPACITY/);
 await db.exec("SET ROLE anon");await assert.rejects(db.query('SELECT * FROM booking_attendance_decisions'),/permission denied/);await assert.rejects(db.query("SELECT change_own_booking('a','c','cancel')"),/permission denied/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('change failures preserve original slot, cancellation is idempotent and started/arrived edits are guarded',async()=>{
 const {db,add,at}=await fixture();try{
 await add('a',1);await add('b',2);
 await assert.rejects(db.query(`SELECT change_own_booking('a','c','reschedule',${at(2)})`),/BOOKING_DAILY_LIMIT/);
 assert.equal((await db.query('SELECT * FROM booking_changes')).rows.length,0);
 await db.query(`SELECT change_own_booking('a','c','reschedule',${at(3)})`);
 assert.equal((await db.query('SELECT * FROM booking_changes')).rows.length,1);
 await db.query("SELECT change_own_booking('b','c','cancel')");await db.query("SELECT change_own_booking('b','c','cancel')");
 assert.equal((await db.query("SELECT * FROM booking_changes WHERE action='cancel'")).rows.length,1);
 await assert.rejects(db.query("SELECT change_own_booking('a','other','cancel')"),/BOOKING_NOT_FOUND/);
 await db.exec("UPDATE bookings SET arrived_at=now(),queue_state='arrived' WHERE id='a'");
 await assert.rejects(db.query(`SELECT change_own_booking('a','c','reschedule',${at(4)})`),/BOOKING_CONTACT_DESK/);
 await db.exec("UPDATE bookings SET queue_state='serving',actual_start_time=now() WHERE id='a'");
 await assert.rejects(db.query("SELECT change_own_booking('a','c','cancel')"),/BOOKING_ALREADY_STARTED/);
 }finally{await db.close();}
});
test('no-show needs authorized contact review; corrections lift restrictions without reviving a cancelled booking',async()=>{
 const {db,add}=await fixture();try{
 await add('a',1);
 await assert.rejects(db.query("SELECT decide_booking_attendance('a','stylist','no_show','电话确认无人接听')"),/FORBIDDEN/);
 await assert.rejects(db.query("SELECT decide_booking_attendance('a','outsider','no_show','电话确认无人接听')"),/FORBIDDEN/);
 await assert.rejects(db.query("SELECT decide_booking_attendance('a','front','no_show','电话确认无人接听')"),/NOT_NO_SHOW/);
 await db.exec("DROP TRIGGER booking_occupancy_guard ON bookings;UPDATE bookings SET scheduled_time=now()-interval '2 hours' WHERE id='a';CREATE TRIGGER booking_occupancy_guard BEFORE INSERT OR UPDATE OF scheduled_time,stylist_id,service_id,status ON bookings FOR EACH ROW EXECUTE FUNCTION booking_occupancy_guard();");
 await db.query("SELECT decide_booking_attendance('a','front','no_show','电话确认顾客今日无法到店')");
 await db.query("SELECT decide_booking_attendance('a','front','no_show','电话确认顾客今日无法到店')");
 assert.equal((await db.query('SELECT * FROM booking_attendance_decisions')).rows.length,1);
 await add('b',2);await add('c',3);
 await db.exec("DROP TRIGGER booking_occupancy_guard ON bookings;UPDATE bookings SET scheduled_time=now()-interval '2 hours' WHERE id IN ('b','c');CREATE TRIGGER booking_occupancy_guard BEFORE INSERT OR UPDATE OF scheduled_time,stylist_id,service_id,status ON bookings FOR EACH ROW EXECUTE FUNCTION booking_occupancy_guard();");
 await db.query("SELECT decide_booking_attendance('b','front','no_show','电话确认顾客今日无法到店')");
 await assert.rejects(add('restricted',4),/BOOKING_TODAY_ONLY/);
 await db.query("SELECT decide_booking_attendance('c','front','no_show','电话确认顾客今日无法到店')");
 await assert.rejects(add('blocked',4),/BOOKING_SUSPENDED/);
 await assert.rejects(db.query("SELECT decide_booking_attendance('b','front','reverse','前台忘记登记签到')"),/FORBIDDEN/);
 await db.query("SELECT decide_booking_attendance('b','manager','reverse','前台忘记登记签到')");
 await db.query("SELECT decide_booking_attendance('c','manager','reverse','门店延误协商了改期')");
 await add('restored',4);
 assert.equal((await db.query<{status:string}>("SELECT status FROM bookings WHERE id='b'")).rows[0].status,'cancelled');
 }finally{await db.close();}
});

test('cancelling does not reset creation rate and temporary changes are recorded without inventing no-shows',async()=>{
 const {db,add}=await fixture();try{
 for(let i=0;i<5;i++){await add('rate'+i,1);await db.query("SELECT change_own_booking($1,'c','cancel')",['rate'+i]);}
 await assert.rejects(add('sixth',1),/BOOKING_RATE_LIMIT/);
 assert.equal((await db.query('SELECT * FROM booking_attendance_decisions')).rows.length,0);
 assert.equal((await db.query('SELECT * FROM booking_changes WHERE late')).rows.length,0);
 await add('late',1,'other');
 await db.exec("UPDATE bookings SET scheduled_time=clock_timestamp()+interval '30 minutes' WHERE id='late'");
 await db.query("SELECT change_own_booking('late','other','cancel')");
 assert.equal((await db.query('SELECT * FROM booking_changes WHERE late')).rows.length,1);
 assert.equal((await db.query('SELECT * FROM booking_attendance_decisions')).rows.length,0);
 }finally{await db.close();}
});
