-- 只安装结构，不重放结算或回填已有客户。兼容缺少历史022的独立重建库。
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_stylist TEXT;

-- 到店记录由原子结算写入；结算完成时同步档案，不把预约报价当实际消费。
CREATE OR REPLACE FUNCTION public.sync_customer_last_service() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE visit customer_visit_records%ROWTYPE;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.payment_status='completed' THEN RETURN NEW; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.items) item WHERE item->>'type'='service') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO visit FROM customer_visit_records
    WHERE id='visit_'||NEW.id AND customer_id=NEW.customer_id AND shop_id=NEW.shop_id;
  -- 旧版/人工单没有可信到店记录时不猜测日期、发型师或项目。
  IF NOT FOUND OR visit.check_in_time IS NULL OR cardinality(visit.service_names)=0 THEN RETURN NEW; END IF;
  UPDATE customers SET last_stylist=visit.stylist_name,
    last_service_items=visit.service_names, last_visit_at=visit.check_in_time
    WHERE id=NEW.customer_id AND shop_id=NEW.shop_id
      AND (last_visit_at IS NULL OR last_visit_at<=visit.check_in_time);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_customer_last_service() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_customer_last_service() TO service_role;
DROP TRIGGER IF EXISTS sync_customer_last_service ON public.settlements;
CREATE TRIGGER sync_customer_last_service AFTER INSERT OR UPDATE OF payment_status ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_last_service();
