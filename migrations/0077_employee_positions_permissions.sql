-- Add role metadata and granular workspace permissions for employee accounts.
ALTER TABLE employees ADD COLUMN position TEXT NOT NULL DEFAULT 'packing_staff';
ALTER TABLE employees ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '{"dashboard":true,"orders":true,"labels":true,"notifications":true}';
