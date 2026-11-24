-- Retired: this fixture installed default employee credentials and could modify existing accounts.
DO $$
BEGIN
  RAISE EXCEPTION 'Legacy seed is disabled. For an isolated local database use the guarded development seed command.';
END $$;
