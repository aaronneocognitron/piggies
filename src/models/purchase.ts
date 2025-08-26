import { Address, Dictionary } from "@ton/ton";
import { SenderArguments, TonClient, type Sender } from "@ton/ton";

import {
  PigApproval,
  PigApprovalEvent,
  PigCreationEvent,
  UpgradePig,
  WithdrawFromPigEvent,
} from "../../wrappers/PigShop";
import { txHistory, UserHistory } from "./history";
import { PigLevel } from "./pigs";

export type PurchasePigRequest = {
  telegram_id: string;
  wallet_address: string;
};

export type PigInfo = {
  level: PigLevel;
  price: number;
  balance_limit: number;
  tokens_per_day: number;
  token_limit: number;
};

export type PigInfosResponse = {
  success: true;
  pigs: PigInfo[];
} | {
  success: false;
  message: string;
};

export type PurchasePigResponse = {
  success: boolean;
  message: txHistory | UpgradePigParams | UserHistory[] | string | any;
};

export interface bountyHuntersResponse {
  referrer: Dictionary<Address, bigint>;
  users: Dictionary<Address, bigint>;
  admins: Dictionary<Address, bigint>;
}

export type upgradeUserPigsInternalResponse = {
  old_pig_level: PigLevel;
  new_pig_level: PigLevel;
  address: Address | null;
};

export interface extendedPigUpgradeEvent extends UpgradePig {
  tx_hash: string;
}

export interface extendedPigApprovalEvent extends PigApprovalEvent {
  tx_hash: string;
  referrer?: Dictionary<Address, bigint>;
}

export interface extendedPigCreationEvent extends PigCreationEvent {
  tx_hash: string;
}

export interface extendedWithdrawFromPigEvent extends WithdrawFromPigEvent {
  tx_hash: string;
}

export interface UpgradePigParams {
  amount: bigint | string;
  operation: "UpgradePig";
}

export interface WithdrawPigParams {
  amount: bigint | string;
  pig_address: string;
  operation: "WithdrawFromNftPig";
  balance: bigint | string;
}
