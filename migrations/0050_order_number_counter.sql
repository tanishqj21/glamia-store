-- Sequential counter for customer-facing order numbers (GM-DDMMYYYY-XXX-NNNNN).
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Start the sequence after the orders that already exist so numbers never repeat.
INSERT INTO counters (name, value)
  SELECT 'order_number', (SELECT COUNT(*) FROM orders)
  WHERE NOT EXISTS (SELECT 1 FROM counters WHERE name = 'order_number');
