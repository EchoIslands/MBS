-- Require explicit employee credentials. Existing rows and sessions are unchanged.
ALTER TABLE public.employees ALTER COLUMN password_hash DROP DEFAULT;
