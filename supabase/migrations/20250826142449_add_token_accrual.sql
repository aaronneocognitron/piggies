-- Add the new columns
ALTER TABLE public.users
    ADD COLUMN accrual_start timestamptz,
    ADD COLUMN token_balance bigint NOT NULL DEFAULT 0;

ALTER TABLE public.pig_levels
    ADD COLUMN tokens_per_day bigint NOT NULL DEFAULT 0,
  ADD COLUMN token_limit bigint NOT NULL DEFAULT 0;

-- Backfill existing rows
UPDATE public.users
SET accrual_start = created_at
WHERE accrual_start IS NULL;

-- Backfill values per level
UPDATE public.pig_levels SET tokens_per_day = 3312, token_limit = 100000 WHERE level = 1;
UPDATE public.pig_levels SET tokens_per_day = 6624, token_limit = 200000 WHERE level = 2;
UPDATE public.pig_levels SET tokens_per_day = 16560, token_limit = 500000 WHERE level = 3;
UPDATE public.pig_levels SET tokens_per_day = 33120, token_limit = 1000000 WHERE level = 4;

-- Ensure accrual_start auto-fills from created_at on insert
CREATE OR REPLACE FUNCTION public.set_users_accrual_start_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.accrual_start IS NULL THEN
    NEW.accrual_start := COALESCE(NEW.created_at, now());
END IF;
  IF NEW.token_balance IS NULL THEN
    NEW.token_balance := 0;
END IF;
RETURN NEW;
END;

$$;

CREATE TRIGGER trg_users_accrual_start_default
    BEFORE INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_users_accrual_start_default();


-- 2) Read helper: compute current balance without writing
CREATE OR REPLACE FUNCTION public.user_balance_now(
  p_user_id bigint,
  p_at timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH u AS (
    SELECT u.token_balance,
           COALESCE(u.accrual_start, u.created_at) AS accrual_start,
           COALESCE(pl.tokens_per_day, 0) AS tokens_per_day,
           COALESCE(pl.token_limit, 0)    AS token_limit
    FROM public.users u
    LEFT JOIN public.pig_levels pl ON pl.level = u.current_pig
    WHERE u.id = p_user_id
  )
SELECT LEAST(
               u.token_limit,
               u.token_balance + (
                   (u.tokens_per_day::numeric *
              GREATEST(0, EXTRACT(EPOCH FROM (p_at - u.accrual_start))::bigint)::numeric
                       ) / 86400
                   )::bigint
       )::bigint
FROM u;

$$;


-- 3) Write helper: settle (persist) balance and reset checkpoint to now
CREATE OR REPLACE FUNCTION public.settle_user_tokens(
  p_user_id bigint,
  p_at timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
v_balance bigint;
BEGIN
WITH locked AS (
    SELECT u.id,
           u.token_balance,
           COALESCE(u.accrual_start, u.created_at) AS accrual_start,
           COALESCE(pl.tokens_per_day, 0) AS tokens_per_day,
           COALESCE(pl.token_limit, 0)    AS token_limit
    FROM public.users u
             LEFT JOIN public.pig_levels pl ON pl.level = u.current_pig
    WHERE u.id = p_user_id
    FOR UPDATE OF u
    ),
  calc AS (
    SELECT id,
           LEAST(
             token_limit,
             token_balance + (
               (tokens_per_day::numeric *
                GREATEST(0, EXTRACT(EPOCH FROM (p_at - accrual_start))::bigint)::numeric
               ) / 86400
             )::bigint
           ) AS new_balance
    FROM locked
  )
UPDATE public.users u
SET token_balance = c.new_balance,
    accrual_start = p_at
    FROM calc c
WHERE u.id = c.id
    RETURNING c.new_balance INTO v_balance;

IF v_balance IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
END IF;

RETURN v_balance;
END;

$$;


-- 4) Automatically settle if the user changes level
CREATE OR REPLACE FUNCTION public.trg_users_settle_on_level_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
v_old_tokens_per_day bigint := 0;
  v_old_token_limit    bigint := 0;
  v_new_token_limit    bigint := 0;
  v_elapsed_seconds    bigint := 0;
  v_accrued            bigint := 0;
  v_balance            bigint := 0;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.current_pig <> OLD.current_pig THEN
    -- Old level: default to zeros if not found
SELECT tokens_per_day, token_limit
INTO v_old_tokens_per_day, v_old_token_limit
FROM public.pig_levels
WHERE level = OLD.current_pig;

IF NOT FOUND THEN
      v_old_tokens_per_day := 0;
      v_old_token_limit := 0;
ELSE
      v_old_tokens_per_day := COALESCE(v_old_tokens_per_day, 0);
      v_old_token_limit := COALESCE(v_old_token_limit, 0);
END IF;

    -- New level limit: default to zero if not found
SELECT token_limit
INTO v_new_token_limit
FROM public.pig_levels
WHERE level = NEW.current_pig;

IF NOT FOUND THEN
      v_new_token_limit := 0;
ELSE
      v_new_token_limit := COALESCE(v_new_token_limit, 0);
END IF;

    v_elapsed_seconds := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(OLD.accrual_start, OLD.created_at)))::bigint);
    v_accrued := ((v_old_tokens_per_day::numeric * v_elapsed_seconds::numeric) / 86400)::bigint;

    -- Settle with old cap, then clamp to the new cap (zeros if missing)
    v_balance := LEAST(v_old_token_limit, OLD.token_balance + v_accrued);
    v_balance := LEAST(v_new_token_limit, v_balance);

    NEW.token_balance := v_balance;
    NEW.accrual_start := now();
END IF;

RETURN NEW;
END;

$$;

CREATE TRIGGER trg_users_settle_on_level_change
    BEFORE UPDATE OF current_pig ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_users_settle_on_level_change();
