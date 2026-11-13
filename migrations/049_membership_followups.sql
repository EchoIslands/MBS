-- Contact records are append-only and tied to a specific membership expiry cycle.
CREATE TABLE IF NOT EXISTS public.membership_followups (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id text NOT NULL REFERENCES public.shops(id),customer_id text NOT NULL REFERENCES public.customers(id),
 membership_type text NOT NULL CHECK(membership_type IN ('vip','stored')),
 expires_at timestamptz NOT NULL,outcome text NOT NULL CHECK(outcome IN ('contacted','unreachable','declined','scheduled')),
 next_followup_at timestamptz,note text NOT NULL DEFAULT '',employee_id text NOT NULL,employee_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_followups_cycle ON public.membership_followups(shop_id,customer_id,membership_type,expires_at,id DESC);
ALTER TABLE public.membership_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_followups FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.membership_followups TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.membership_followups_id_seq TO service_role;
CREATE OR REPLACE FUNCTION public.record_membership_followup(p_customer_id text,p_shop_id text,p_employee_id text,p_type text,p_expiry timestamptz,p_outcome text,p_next timestamptz,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; actor employees%ROWTYPE; actual_expiry timestamptz;
BEGIN
 SELECT * INTO actor FROM employees WHERE id=p_employee_id AND shop_id=p_shop_id AND is_active=true;
 IF NOT FOUND OR actor.role NOT IN ('ceo','customer_service') THEN RAISE EXCEPTION 'FOLLOWUP_FORBIDDEN'; END IF;
 SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND OR p_type NOT IN ('vip','stored') THEN RAISE EXCEPTION 'FOLLOWUP_INVALID'; END IF;
 actual_expiry:=CASE WHEN p_type='vip' THEN c.purchase_vip_expires_at ELSE c.stored_value_expires_at END;
 IF actual_expiry IS NULL OR actual_expiry IS DISTINCT FROM p_expiry OR (p_type='vip' AND c.purchase_vip_level='regular') OR (p_type='stored' AND c.stored_value_level='none') THEN RAISE EXCEPTION 'FOLLOWUP_STALE'; END IF;
 IF p_outcome NOT IN ('contacted','unreachable','declined','scheduled') OR length(p_note)>300 OR (p_outcome IN ('unreachable','scheduled') AND p_next IS NULL) OR (p_next IS NOT NULL AND p_next<=now()) THEN RAISE EXCEPTION 'FOLLOWUP_INVALID'; END IF;
 INSERT INTO membership_followups(shop_id,customer_id,membership_type,expires_at,outcome,next_followup_at,note,employee_id,employee_name)
 VALUES(p_shop_id,c.id,p_type,p_expiry,p_outcome,p_next,coalesce(p_note,''),actor.id,actor.name);
END $$;
REVOKE ALL ON FUNCTION public.record_membership_followup(text,text,text,text,timestamptz,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_membership_followup(text,text,text,text,timestamptz,text,timestamptz,text) TO service_role;
