CREATE TABLE public.token_withdrawal_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  query_id bigint NOT NULL DEFAULT 0,
  wallet_address text NOT NULL,
  amount bigint NOT NULL,
  related_tx text NOT NULL,
  CONSTRAINT token_withdrawal_history_pkey PRIMARY KEY (id),
  CONSTRAINT token_withdrawal_history_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);
