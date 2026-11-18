-- 060: owner-confirmed commission records; records only, never payroll or money transfer.
CREATE TABLE IF NOT EXISTS commission_sources (
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL REFERENCES shops(id),kind TEXT NOT NULL,
 source_record_id TEXT NOT NULL,payload JSONB NOT NULL,occurred_at TIMESTAMPTZ NOT NULL,
 reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(kind,source_record_id)
);
CREATE INDEX IF NOT EXISTS commission_sources_pending ON commission_sources(shop_id,reviewed_at,occurred_at DESC);
CREATE TABLE IF NOT EXISTS commission_entries (
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL REFERENCES shops(id),source_id TEXT NOT NULL REFERENCES commission_sources(id),
 employee_id TEXT NOT NULL REFERENCES employees(id),period TEXT NOT NULL CHECK(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 rank TEXT NOT NULL CHECK(rank IN ('designer','gold','manager','director')),
 kind TEXT NOT NULL CHECK(kind IN ('income','redemption','gift','transfer_in','transfer_out','refund','correction')),
 base_amount NUMERIC(12,2) NOT NULL DEFAULT 0,transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
 reference_id TEXT REFERENCES commission_entries(id),refund_base_at_transfer NUMERIC(12,2) NOT NULL DEFAULT 0,actor_id TEXT NOT NULL,reason TEXT NOT NULL,
 request_id TEXT NOT NULL,request JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS commission_entry_period ON commission_entries(shop_id,period,employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS commission_entry_request ON commission_entries(shop_id,request_id,id);
ALTER TABLE commission_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commission_sources,commission_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON commission_sources,commission_entries TO service_role;

CREATE OR REPLACE FUNCTION enqueue_commission_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row JSONB:=to_jsonb(NEW); shop TEXT; category TEXT:=TG_TABLE_NAME; occurred TIMESTAMPTZ;
BEGIN
 IF category='settlements' AND row->>'payment_status'<>'completed' THEN RETURN NEW; END IF;
 IF category='stored_value_transactions' AND row->>'type'<>'recharge' THEN RETURN NEW; END IF;
 IF category='refund_requests' AND row->>'status'<>'completed' THEN RETURN NEW; END IF;
 -- Legacy records may contain an empty string instead of NULL.  Never enqueue
 -- evidence for an unknown shop: commission_sources.shop_id has a strict FK.
 shop:=NULLIF(btrim(row->>'shop_id'),'');
 IF shop IS NULL THEN
   SELECT NULLIF(btrim(shop_id),'') INTO shop FROM customers WHERE id=row->>'customer_id';
 END IF;
 IF shop IS NULL OR NOT EXISTS (SELECT 1 FROM shops WHERE id=shop) THEN RETURN NEW; END IF;
 occurred:=COALESCE((row->>'manual_paid_at')::TIMESTAMPTZ,(row->>'paid_at')::TIMESTAMPTZ,(row->>'processed_at')::TIMESTAMPTZ,(row->>'created_at')::TIMESTAMPTZ,NOW());
 INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at)
 VALUES(category||':'||(row->>'id'),shop,category,row->>'id',row,occurred) ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commission_source_settlement ON settlements;
CREATE TRIGGER commission_source_settlement AFTER INSERT OR UPDATE OF payment_status ON settlements FOR EACH ROW EXECUTE FUNCTION enqueue_commission_source();
DROP TRIGGER IF EXISTS commission_source_recharge ON stored_value_transactions;
CREATE TRIGGER commission_source_recharge AFTER INSERT ON stored_value_transactions FOR EACH ROW EXECUTE FUNCTION enqueue_commission_source();
DROP TRIGGER IF EXISTS commission_source_package ON customer_packages;
CREATE TRIGGER commission_source_package AFTER INSERT ON customer_packages FOR EACH ROW EXECUTE FUNCTION enqueue_commission_source();
DROP TRIGGER IF EXISTS commission_source_refund ON refund_requests;
CREATE TRIGGER commission_source_refund AFTER INSERT OR UPDATE OF status ON refund_requests FOR EACH ROW EXECUTE FUNCTION enqueue_commission_source();
REVOKE ALL ON FUNCTION enqueue_commission_source() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION commission_record(p_shop TEXT,p_actor TEXT,p_request JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor employees%ROWTYPE; emp employees%ROWTYPE; src commission_sources%ROWTYPE; ref commission_entries%ROWTYPE;
 existing commission_entries%ROWTYPE; category TEXT:=p_request->>'kind'; key TEXT:=p_request->>'requestId';
 basis NUMERIC:=(p_request->>'amount')::NUMERIC; reason TEXT:=trim(p_request->>'reason'); month TEXT; employee TEXT:=p_request->>'employeeId';
 rank_name TEXT; moved commission_entries%ROWTYPE; reversed_amount NUMERIC; reverse_delta NUMERIC; refunded NUMERIC; other NUMERIC; allocation NUMERIC; current_base NUMERIC; rate NUMERIC; result JSONB;
BEGIN
 SELECT * INTO actor FROM employees WHERE id=p_actor AND shop_id=p_shop AND role='ceo' AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_FORBIDDEN'; END IF;
 IF key IS NULL OR key !~ '^[A-Za-z0-9_-]{16,100}$' OR reason IS NULL OR length(reason)<4 OR length(reason)>500
 OR basis IS NULL OR basis::TEXT IN ('NaN','Infinity','-Infinity') OR basis<0 OR basis<>round(basis,2) OR basis>1000000
 OR category NOT IN ('income','redemption','gift','transfer','refund') THEN RAISE EXCEPTION 'COMMISSION_INVALID'; END IF;
 -- Shop lock serializes review, transfers, refunds and rank snapshots for a month.
 PERFORM 1 FROM shops WHERE id=p_shop FOR UPDATE;
 SELECT * INTO existing FROM commission_entries WHERE shop_id=p_shop AND request_id=key LIMIT 1;
 IF FOUND THEN
 IF existing.actor_id<>p_actor OR existing.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'COMMISSION_REQUEST_CONFLICT'; END IF;
 RETURN jsonb_build_object('id',existing.id,'replayed',TRUE); END IF;
 SELECT * INTO src FROM commission_sources WHERE id=p_request->>'sourceId' AND shop_id=p_shop FOR UPDATE;
 IF NOT FOUND OR src.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'COMMISSION_SOURCE_UNAVAILABLE'; END IF;
 SELECT * INTO emp FROM employees WHERE id=employee AND shop_id=p_shop AND role IN ('stylist','shop_manager','ceo');
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_EMPLOYEE_REQUIRED'; END IF;
 month:=to_char(src.occurred_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM');
 rank_name:=CASE WHEN emp.role='shop_manager' THEN 'manager' WHEN emp.title LIKE '%总监%' THEN 'director' WHEN emp.is_gold_stylist THEN 'gold' ELSE 'designer' END;
 IF category IN ('transfer','refund') THEN
   SELECT * INTO ref FROM commission_entries WHERE id=p_request->>'referenceId' AND shop_id=p_shop AND kind IN ('income','gift') FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_ORIGIN_REQUIRED'; END IF;
   IF (SELECT payload->>'customer_id' FROM commission_sources WHERE id=ref.source_id) IS DISTINCT FROM src.payload->>'customer_id' THEN RAISE EXCEPTION 'COMMISSION_CUSTOMER_MISMATCH'; END IF;
   month:=ref.period;
   IF category='refund' THEN
    IF src.kind NOT IN ('refund_requests','manual_refund_receipts') THEN RAISE EXCEPTION 'COMMISSION_REFUND_RECEIPT_REQUIRED'; END IF;
    IF ref.employee_id<>employee THEN RAISE EXCEPTION 'COMMISSION_REFUND_OWNER_MISMATCH'; END IF;
    -- Refund must reference the exact settlement, not another sale by the same customer.
    IF src.kind='manual_refund_receipts' THEN
      IF src.payload->>'origin_source_id' IS DISTINCT FROM ref.source_id THEN RAISE EXCEPTION 'COMMISSION_REFUND_ORIGIN_MISMATCH'; END IF;
    ELSIF (src.payload->>'settlement_id') IS DISTINCT FROM (SELECT source_record_id FROM commission_sources WHERE id=ref.source_id AND kind='settlements') THEN RAISE EXCEPTION 'COMMISSION_REFUND_ORIGIN_MISMATCH'; END IF;
    SELECT COALESCE(-sum(base_amount),0) INTO refunded FROM commission_entries WHERE reference_id=ref.id AND kind='refund';
    IF basis>ref.base_amount-refunded THEN RAISE EXCEPTION 'COMMISSION_REFUND_EXCEEDS_ORIGIN'; END IF;
    employee:=ref.employee_id;rank_name:=ref.rank;
    -- Refund the previously transferred profit to its source as well; append both legs.
    FOR moved IN SELECT * FROM commission_entries WHERE reference_id=ref.id AND kind IN ('transfer_in','transfer_out') ORDER BY id LOOP
      SELECT COALESCE(abs(sum(transfer_amount)),0) INTO reversed_amount FROM commission_entries WHERE reference_id=moved.id AND kind='correction';
      reverse_delta:=ROUND(abs(moved.transfer_amount)*GREATEST(0,refunded+basis-moved.refund_base_at_transfer)/NULLIF(ref.base_amount-moved.refund_base_at_transfer,0),2)-reversed_amount;
      IF reverse_delta>0 THEN
        INSERT INTO commission_entries(id,shop_id,source_id,employee_id,period,rank,kind,transfer_amount,reference_id,actor_id,reason,request_id,request)
        VALUES(key||'_reverse_'||moved.id,p_shop,src.id,moved.employee_id,moved.period,moved.rank,'correction',CASE WHEN moved.transfer_amount>0 THEN -reverse_delta ELSE reverse_delta END,moved.id,p_actor,'退款按原转移比例冲正：'||reason,key,p_request);
      END IF;
    END LOOP;
   ELSE
    IF src.kind<>'settlements' OR employee=ref.employee_id THEN RAISE EXCEPTION 'COMMISSION_TRANSFER_SERVICE_REQUIRED'; END IF;
    SELECT COALESCE(sum(base_amount),0) INTO current_base FROM commission_entries WHERE employee_id=ref.employee_id AND period=ref.period AND shop_id=p_shop;
    rate:=CASE WHEN current_base>=80000 THEN .35 WHEN current_base>=60000 THEN .30 WHEN current_base>=40000 THEN .25 WHEN current_base>=20000 THEN CASE ref.rank WHEN 'designer' THEN .18 WHEN 'gold' THEN .19 ELSE .20 END WHEN current_base>=10000 THEN CASE ref.rank WHEN 'designer' THEN .13 WHEN 'gold' THEN .14 ELSE .15 END ELSE CASE ref.rank WHEN 'designer' THEN .08 WHEN 'gold' THEN .09 ELSE .10 END END;
    SELECT COALESCE(-sum(base_amount),0) INTO refunded FROM commission_entries WHERE reference_id=ref.id AND kind='refund';
    SELECT COALESCE(sum(transfer_amount),0) INTO other FROM commission_entries WHERE reference_id=ref.id AND kind='transfer_out'
      OR reference_id IN (SELECT id FROM commission_entries WHERE reference_id=ref.id AND kind='transfer_out') AND kind='correction';
    IF basis>GREATEST(0,round((ref.base_amount-refunded)*rate,2)+other) THEN RAISE EXCEPTION 'COMMISSION_TRANSFER_EXCEEDS_ORIGIN'; END IF;
    INSERT INTO commission_entries(id,shop_id,source_id,employee_id,period,rank,kind,transfer_amount,reference_id,refund_base_at_transfer,actor_id,reason,request_id,request)
    VALUES(key||'_out',p_shop,src.id,ref.employee_id,ref.period,ref.rank,'transfer_out',-basis,ref.id,refunded,p_actor,reason,key,p_request);
    -- Service recipient receives the agreed profit in the service month, not the sale month.
    month:=to_char(src.occurred_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM');
   END IF;
 ELSE
  IF src.kind IN ('refund_requests','manual_refund_receipts') THEN RAISE EXCEPTION 'COMMISSION_REFUND_REQUIRED'; END IF;
  IF category='income' AND NULLIF(src.payload->>'order_id','') IS NOT NULL AND EXISTS (
    SELECT 1 FROM commission_entries e JOIN commission_sources s ON s.id=e.source_id
    WHERE e.shop_id=p_shop AND e.kind='income' AND e.base_amount>0
      AND s.payload->>'customer_id'=src.payload->>'customer_id' AND s.payload->>'order_id'=src.payload->>'order_id'
  ) THEN RAISE EXCEPTION 'COMMISSION_FUNDING_ALREADY_COUNTED'; END IF;
  IF category='redemption' AND basis<>0 THEN RAISE EXCEPTION 'COMMISSION_REDEMPTION_NOT_NEW_INCOME'; END IF;
  IF category='gift' AND src.kind<>'settlements' THEN RAISE EXCEPTION 'COMMISSION_GIFT_SERVICE_REQUIRED'; END IF;
 END IF;
 -- A later change of staff title cannot silently reclassify an already booked month.
 SELECT rank INTO rank_name FROM commission_entries WHERE shop_id=p_shop AND employee_id=employee AND period=month LIMIT 1;
 IF NOT FOUND THEN rank_name:=CASE WHEN emp.role='shop_manager' THEN 'manager' WHEN emp.title LIKE '%总监%' THEN 'director' WHEN emp.is_gold_stylist THEN 'gold' ELSE 'designer' END; END IF;
 INSERT INTO commission_entries(id,shop_id,source_id,employee_id,period,rank,kind,base_amount,transfer_amount,reference_id,refund_base_at_transfer,actor_id,reason,request_id,request)
 VALUES(key,p_shop,src.id,employee,month,rank_name,CASE WHEN category='transfer' THEN 'transfer_in' ELSE category END,
 CASE WHEN category='refund' THEN -basis WHEN category IN ('income','gift') THEN basis ELSE 0 END,
 CASE WHEN category='transfer' THEN basis ELSE 0 END,CASE WHEN category IN ('transfer','refund') THEN ref.id ELSE NULL END,CASE WHEN category='transfer' THEN refunded ELSE 0 END,p_actor,reason,key,p_request);
 UPDATE commission_sources SET reviewed_at=clock_timestamp() WHERE id=src.id;
 RETURN jsonb_build_object('id',key,'replayed',FALSE);
END $$;
REVOKE ALL ON FUNCTION commission_record(TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION commission_record(TEXT,TEXT,JSONB) TO service_role;
-- Historical financial evidence enters review, never automatic guessed commission.
INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at)
 SELECT 'settlements:'||s.id,sh.id,'settlements',s.id,to_jsonb(s),COALESCE(s.manual_paid_at,s.created_at)
 FROM settlements s LEFT JOIN customers c ON c.id=s.customer_id
 JOIN shops sh ON sh.id=COALESCE(NULLIF(btrim(s.shop_id),''),NULLIF(btrim(c.shop_id),''))
 WHERE s.payment_status='completed' ON CONFLICT(id) DO NOTHING;
INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at)
 SELECT 'stored_value_transactions:'||t.id,sh.id,'stored_value_transactions',t.id,to_jsonb(t),t.created_at
 FROM stored_value_transactions t JOIN customers c ON c.id=t.customer_id
 JOIN shops sh ON sh.id=NULLIF(btrim(c.shop_id),'')
 WHERE t.type='recharge' ON CONFLICT(id) DO NOTHING;
INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at)
 SELECT 'customer_packages:'||p.id,sh.id,'customer_packages',p.id,to_jsonb(p),p.created_at
 FROM customer_packages p LEFT JOIN customers c ON c.id=p.customer_id
 JOIN shops sh ON sh.id=COALESCE(NULLIF(btrim(p.shop_id),''),NULLIF(btrim(c.shop_id),'')) ON CONFLICT(id) DO NOTHING;
INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at)
 SELECT 'refund_requests:'||r.id,sh.id,'refund_requests',r.id,to_jsonb(r),COALESCE(r.processed_at,r.created_at)
 FROM refund_requests r LEFT JOIN customers c ON c.id=r.customer_id
 JOIN shops sh ON sh.id=COALESCE(NULLIF(btrim(r.shop_id),''),NULLIF(btrim(c.shop_id),''))
 WHERE r.status='completed' ON CONFLICT(id) DO NOTHING;
-- CEO records verified offline refunds for recharge/card sales as well as services.
-- This function only appends evidence and commission reversals; it never refunds money.
CREATE OR REPLACE FUNCTION commission_record_manual_refund(p_shop TEXT,p_actor TEXT,p_request JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ref commission_entries%ROWTYPE; origin commission_sources%ROWTYPE; source TEXT; receipt TEXT:=trim(p_request->>'receiptRef');
 occurred TIMESTAMPTZ:=(p_request->>'receiptAt')::TIMESTAMPTZ; request JSONB;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM employees WHERE id=p_actor AND shop_id=p_shop AND role='ceo' AND is_active) THEN RAISE EXCEPTION 'COMMISSION_FORBIDDEN'; END IF;
 IF receipt IS NULL OR length(receipt)<4 OR length(receipt)>200 OR occurred IS NULL OR NOT isfinite(occurred) OR occurred>clock_timestamp()+INTERVAL '5 minutes' THEN RAISE EXCEPTION 'COMMISSION_REFUND_RECEIPT_REQUIRED'; END IF;
 PERFORM 1 FROM shops WHERE id=p_shop FOR UPDATE;
 SELECT * INTO ref FROM commission_entries WHERE id=p_request->>'referenceId' AND shop_id=p_shop AND kind IN ('income','gift');
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_ORIGIN_REQUIRED'; END IF;
 SELECT * INTO origin FROM commission_sources WHERE id=ref.source_id;
 IF occurred<origin.occurred_at THEN RAISE EXCEPTION 'COMMISSION_REFUND_TIME_INVALID'; END IF;
 source:='manual_refund:'||p_shop||':'||md5(receipt);
 IF EXISTS(SELECT 1 FROM commission_sources WHERE shop_id=p_shop AND kind='refund_requests' AND payload->>'refund_receipt_ref'=receipt) THEN RAISE EXCEPTION 'COMMISSION_USE_EXISTING_REFUND_RECEIPT'; END IF;
 request:=(p_request-'receiptAt'-'receiptRef')||jsonb_build_object('sourceId',source,'kind','refund','employeeId',ref.employee_id);
 -- Same receipt cannot be reused with another amount, original sale or operator.
 IF EXISTS(SELECT 1 FROM commission_sources WHERE id=source AND payload IS DISTINCT FROM jsonb_build_object('customer_id',origin.payload->>'customer_id','origin_source_id',origin.id,'receipt_ref',receipt,'receipt_at',occurred,'amount',p_request->'amount','actor_id',p_actor)) THEN RAISE EXCEPTION 'COMMISSION_RECEIPT_CONFLICT'; END IF;
 INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at) VALUES(source,p_shop,'manual_refund_receipts',receipt,jsonb_build_object('customer_id',origin.payload->>'customer_id','origin_source_id',origin.id,'receipt_ref',receipt,'receipt_at',occurred,'amount',p_request->'amount','actor_id',p_actor),occurred) ON CONFLICT(id) DO NOTHING;
 RETURN commission_record(p_shop,p_actor,request);
END $$;
REVOKE ALL ON FUNCTION commission_record_manual_refund(TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION commission_record_manual_refund(TEXT,TEXT,JSONB) TO service_role;
