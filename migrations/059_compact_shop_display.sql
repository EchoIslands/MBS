ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_gold_stylist BOOLEAN NOT NULL DEFAULT FALSE;
-- 059: compact public display data before it crosses the database connection.
-- Original image bytes stay in their source columns for the existing image routes.
CREATE OR REPLACE FUNCTION compact_display_images(p_images JSONB,p_prefix TEXT) RETURNS JSONB
LANGUAGE SQL IMMUTABLE SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(CASE WHEN value #>> '{}' LIKE 'data:%' THEN to_jsonb(p_prefix||(ordinality-1)::TEXT) ELSE value END ORDER BY ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_images)='array' THEN p_images ELSE '[]'::jsonb END) WITH ORDINALITY
$$;
CREATE OR REPLACE FUNCTION shop_display_snapshot(p_shop_id TEXT) RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('shop', (to_jsonb(s)-'avatar'-'images'-'products'-'employees')||jsonb_build_object(
 'avatar',CASE WHEN s.avatar LIKE 'data:%' THEN '/api/shops/'||s.id||'/media/avatar' ELSE s.avatar END,
 'images',compact_display_images(to_jsonb(s.images),'/api/shops/'||s.id||'/media/'),
 'products',COALESCE((SELECT jsonb_agg((x-'images')||jsonb_build_object('images',compact_display_images(x->'images','/api/shops/'||s.id||'/products/'||(x->>'id')||'/images/'))) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.products)='array' THEN s.products ELSE '[]'::jsonb END) x),'[]'::jsonb),
 'employees','[]'::jsonb),
 'employees',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'phone',e.phone,'avatar',CASE WHEN e.avatar LIKE 'data:%' THEN '/api/shops/'||s.id||'/employees/'||e.id||'/avatar' ELSE e.avatar END,'title',e.title,'role',e.role,'rating',e.rating,'is_active',e.is_active,'is_gold_stylist',e.is_gold_stylist,'specialty',e.specialty)) FROM employees e WHERE e.shop_id=s.id AND e.is_active),'[]'::jsonb))
 FROM shops s WHERE s.id=p_shop_id
$$;
REVOKE ALL ON FUNCTION compact_display_images(JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION shop_display_snapshot(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION shop_display_snapshot(TEXT) TO service_role;
