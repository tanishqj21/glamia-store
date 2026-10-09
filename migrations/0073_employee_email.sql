-- Keep an optional staff contact email on employee accounts. It is separate
-- from customer login and is used for operational contact and identification.
ALTER TABLE employees ADD COLUMN employee_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email
  ON employees(employee_email)
  WHERE employee_email IS NOT NULL AND TRIM(employee_email) != '';
