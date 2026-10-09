-- Allow promotions to target every employee email in the employee directory,
-- including employees who have not created a customer account yet.
ALTER TABLE coupons ADD COLUMN employee_only INTEGER NOT NULL DEFAULT 0;
