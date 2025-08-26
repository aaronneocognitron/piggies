import { PigLevel } from "@/models/pigs";

export type User = {
  created_at: `${Date}`;
  accrual_start: `${Date}`;
  current_pig: PigLevel;
  fullname: string;
  id: number;
  inviter_id: number;
  parent_id: number | null;
  pig_address: string | null;
  piggy_bank_balance: number;
  token_balance: number;
  referral_id: string;
  telegram_id: string;
  user_type: 0 | 1;
  wallet_address: string;
};