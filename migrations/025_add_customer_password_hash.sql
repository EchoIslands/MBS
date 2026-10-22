-- Local remediation batch 3. Apply only after an isolated schema check and approval.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;
