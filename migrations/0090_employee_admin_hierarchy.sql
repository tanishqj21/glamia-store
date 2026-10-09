-- Record staff-account origin without guessing who created legacy accounts.
ALTER TABLE employees ADD COLUMN created_by_email TEXT;
ALTER TABLE employees ADD COLUMN created_by_employee_id TEXT;
ALTER TABLE employees ADD COLUMN created_by_owner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN owner_approved INTEGER NOT NULL DEFAULT 0;

-- Preserve the owner account explicitly provisioned for this workspace before provenance existed.
UPDATE employees SET position = 'admin', created_by_owner = 1, owner_approved = 1, created_by_email = 'tanishqj29@gmail.com'
WHERE employee_code = 'ADMIN_001' AND LOWER(employee_email) = 'tanishqj29@gmail.com';

-- Verified website identities resolve staff access through an indexed email lookup.
CREATE INDEX IF NOT EXISTS idx_employees_email_lower ON employees(LOWER(employee_email));
