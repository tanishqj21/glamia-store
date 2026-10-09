-- Keep legacy packing accounts limited to packing-related workspace access.
-- Explicit custom permissions are preserved; this only normalizes the old
-- migration default that granted dashboard and notifications automatically.
UPDATE employees
SET permissions_json = '{"orders":true,"labels":true}'
WHERE position = 'packing_staff'
  AND permissions_json = '{"dashboard":true,"orders":true,"labels":true,"notifications":true}';
