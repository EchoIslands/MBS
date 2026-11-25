BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS login_name TEXT
  CHECK (
    login_name IS NULL OR (
      role = 'queue_display' AND phone IS NULL
      AND login_name ~ '^[a-z0-9_-]{4,32}$' AND login_name ~ '[a-z]'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS employees_login_name_uidx
  ON public.employees (login_name) WHERE login_name IS NOT NULL;

COMMIT;
