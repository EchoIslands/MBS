-- 创建提现申请表（如不存在）
create table if not exists withdrawal_requests (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  customer_id text references customers(id) on delete cascade,
  customer_name text,
  customer_phone text,
  amount numeric(12,2) not null default 0,
  channel text not null default 'wechat', -- wechat: 提现到微信, consume: 抵扣消费
  status text not null default 'pending', -- pending / approved / paid / rejected
  reject_reason text,
  paid_at timestamptz,
  paid_by text,
  transaction_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_withdrawal_requests_customer_id on withdrawal_requests(customer_id);
create index if not exists idx_withdrawal_requests_shop_id on withdrawal_requests(shop_id);
create index if not exists idx_withdrawal_requests_status on withdrawal_requests(status);
