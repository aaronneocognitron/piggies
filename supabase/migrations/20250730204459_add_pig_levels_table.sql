CREATE TABLE public.pig_levels (
    level smallint PRIMARY KEY,
    price bigint NOT NULL,
    balance_limit bigint NOT NULL
);

INSERT INTO public.pig_levels (level, price, balance_limit) VALUES
    (1, 3000000000, 15000000000),         -- price: 3 TON,    limit: 15 TON
    (2, 30000000000, 150000000000),       -- price: 30 TON,   limit: 150 TON
    (3, 300000000000, 1500000000000),     -- price: 300 TON,  limit: 1500 TON
    (4, 3000000000000, 15000000000000);   -- price: 3000 TON, limit: 15000 TON

CREATE OR REPLACE FUNCTION increment_piggy_bank_balance(
  wallet_address_in text,
  amount_in bigint
)
RETURNS TABLE (
  id bigint,
  wallet_address text,
  current_pig smallint,
  piggy_bank_balance bigint
) AS $$
DECLARE
balance_limit bigint;
current_pig_level smallint;
BEGIN
  -- Lock the user row and get current pig level
SELECT u.current_pig
INTO current_pig_level
FROM users u
WHERE u.wallet_address = wallet_address_in
    FOR UPDATE;

-- Get balance limit from pig_levels, fallback to max bigint if not found
SELECT COALESCE(pl.balance_limit, 9223372036854775807)
INTO balance_limit
FROM pig_levels pl
WHERE pl.level = current_pig_level;

-- Update the balance, clamp to balance_limit
UPDATE users u
SET piggy_bank_balance = LEAST(u.piggy_bank_balance + amount_in, balance_limit)
WHERE u.wallet_address = wallet_address_in;

-- Return updated row
RETURN QUERY
SELECT u.id, u.wallet_address, u.current_pig, u.piggy_bank_balance
FROM users u
WHERE u.wallet_address = wallet_address_in;
END;
$$ LANGUAGE plpgsql;
