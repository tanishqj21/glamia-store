-- Preserve existing packing access while separating it from order administration.
UPDATE employees
SET permissions_json = json_set(permissions_json, '$.packing', json('true'))
WHERE json_valid(permissions_json)
  AND json_type(permissions_json, '$.packing') IS NULL
  AND json_extract(permissions_json, '$.orders') = 1;

-- Existing default packers had Orders and Labels only; convert those defaults to packing-only access.
UPDATE employees
SET permissions_json = json_set(permissions_json, '$.orders', json('false'), '$.labels', json('false'))
WHERE position = 'packing_staff'
  AND json_valid(permissions_json)
  AND json_extract(permissions_json, '$.packing') = 1
  AND NOT EXISTS (
    SELECT 1 FROM json_each(employees.permissions_json)
    WHERE type = 'true' AND key NOT IN ('packing', 'orders', 'labels')
  );
