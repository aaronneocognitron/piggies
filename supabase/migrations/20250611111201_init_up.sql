-- 1. Users table
CREATE TABLE public.users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telegram_id text NOT NULL,
  inviter_id bigint,
  parent_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  referral_id uuid DEFAULT gen_random_uuid() UNIQUE,
  wallet_address text UNIQUE,
  current_pig smallint NOT NULL DEFAULT 0,
  fullname text DEFAULT '',
  piggy_bank_balance bigint DEFAULT 0,
  user_type smallint NOT NULL DEFAULT 1,
  pig_address text,
  CONSTRAINT users_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.users(id),
  CONSTRAINT users_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id)
);

-- 2. appData table (no foreign keys)
CREATE TABLE public.appData (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tier text NOT NULL UNIQUE,
  price_in_usd text NOT NULL,
  price_in_ton text NOT NULL,
  CONSTRAINT appData_pkey PRIMARY KEY (id)
);

-- 3. rewardsHistory table (references users)
CREATE TABLE public.rewards_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  wallet_address text NOT NULL,
  reward bigint NOT NULL,
  referral text NOT NULL,
  related_tx text NOT NULL,
  CONSTRAINT rewards_history_pkey PRIMARY KEY (id),
  CONSTRAINT reward_history_referral_fkey FOREIGN KEY (referral) REFERENCES public.users(wallet_address),
  CONSTRAINT reward_history_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);

-- 4. txHistory table (references users)
CREATE TABLE public.tx_history (
  tx_id text NOT NULL,
  tx_hash text NOT NULL UNIQUE,
  wallet_address text NOT NULL,
  request_status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  upgraded_pig_level integer,
  CONSTRAINT tx_history_pkey PRIMARY KEY (tx_id, tx_hash),
  CONSTRAINT tx_history_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);
