CREATE TABLE IF NOT EXISTS public.queue_notification_consent (
 shop_id text NOT NULL, customer_id text NOT NULL, openid text NOT NULL,
 template_id text NOT NULL, quota integer NOT NULL DEFAULT 1 CHECK(quota BETWEEN 0 AND 10),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(shop_id,customer_id)
);
CREATE TABLE IF NOT EXISTS public.queue_notification_outbox (
 id bigint PRIMARY KEY REFERENCES public.booking_queue_events(id), shop_id text NOT NULL,
 booking_id text NOT NULL REFERENCES public.bookings(id), event_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','phone','obsolete')),
 channel text, reason text, provider_id text, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS queue_notifications_pending ON public.queue_notification_outbox(status,created_at);
ALTER TABLE public.queue_notification_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.queue_notification_consent,public.queue_notification_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.queue_notification_consent TO service_role;
GRANT SELECT,UPDATE ON public.queue_notification_outbox TO service_role;
CREATE OR REPLACE FUNCTION public.enqueue_queue_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.event_type IN ('ready','called') THEN
  INSERT INTO queue_notification_outbox(id,shop_id,booking_id,event_type,expires_at)
  VALUES(NEW.id,NEW.shop_id,NEW.booking_id,NEW.event_type,now()+CASE WHEN NEW.event_type='called' THEN interval '10 minutes' ELSE interval '2 minutes' END)
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enqueue_queue_notification ON public.booking_queue_events;
CREATE TRIGGER enqueue_queue_notification AFTER INSERT ON public.booking_queue_events FOR EACH ROW EXECUTE FUNCTION public.enqueue_queue_notification();
REVOKE ALL ON FUNCTION public.enqueue_queue_notification() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.claim_queue_notification() RETURNS SETOF public.queue_notification_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job queue_notification_outbox%ROWTYPE;
BEGIN
 -- A lost send acknowledgement is ambiguous: never automatically resend a possibly delivered SMS.
 UPDATE queue_notification_outbox SET status='phone',reason='发送结果未知，需电话核实',finished_at=now()
 WHERE status='sending' AND lease_until<now();
 UPDATE queue_notification_outbox SET status='obsolete',reason='提醒已过时',finished_at=now()
 WHERE status='pending' AND expires_at<=now();
 SELECT * INTO job FROM queue_notification_outbox WHERE status='pending' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE queue_notification_outbox SET status='sending',lease_until=now()+interval '60 seconds' WHERE id=job.id RETURNING * INTO job;
 RETURN NEXT job;
END $$;
REVOKE ALL ON FUNCTION public.claim_queue_notification() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_queue_notification() TO service_role;
CREATE OR REPLACE FUNCTION public.consume_queue_subscription(p_shop_id text,p_customer_id text)
RETURNS SETOF public.queue_notification_consent LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY UPDATE queue_notification_consent SET quota=quota-1 WHERE shop_id=p_shop_id AND customer_id=p_customer_id AND quota>0 RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.consume_queue_subscription(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_queue_subscription(text,text) TO service_role;
