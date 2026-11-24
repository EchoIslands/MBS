-- Retired: the old reset script dropped business tables without a database guard.
DO $$
BEGIN
  RAISE EXCEPTION 'Legacy reset is disabled. Use the tracked migrations for a new isolated database.';
END $$;
