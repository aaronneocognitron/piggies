import { supabase } from "./supabase";
import { error } from "console";
import { PigLevel } from "@/models/pigs";
import { BitString, Dictionary, DictionaryKeyTypes, toNano } from "@ton/core";

export async function getUser(wallet_address: string) {
  const { data, error: fetchError } = await supabase
    .from("users")
    .select("id, wallet_address, fullname, parent_id, inviter_id, current_pig")
    .eq("wallet_address", wallet_address.trim().toLowerCase())
    .single();

  if (fetchError) {
    throw new Error(
      `Error fetching user(getUser):
      ${fetchError.message}
      ${wallet_address.trim().toLowerCase()}`
    );
  }

  return data!;
}

export async function getUpgradedPigLevel(tx_hash: string): Promise<number> {
  const { data: user, error: fetchError } = await supabase
    .from("tx_history")
    .select("upgraded_pig_level")
    .eq("tx_hash", tx_hash)
    .single();

  if (fetchError) {
    throw new Error(
      `Error fetching user (getUpgradedPigLevel):
      ${fetchError.message}`
    );
  }
  return user?.upgraded_pig_level || 0;
}

export async function prepareUserHistoryObj(tx: any): Promise<any> {
  console.log("tx in pre", tx);
  if (tx.reward) {
    console.log("tx.referral", tx.referral);
    const user = await getUser(tx.referral);
    return {
      created_at: tx.created_at,
      fullname: user.fullname,
      upgraded_pig_level: (await getUpgradedPigLevel(
        tx.related_tx
      ).catch(() => user.current_pig)) as PigLevel,
      self_balance_change: tx.reward,
      reward_type: tx.reward_type,
      //referral_depth: 0, //TODO: check referral or bounty hunter
    };
  } if (tx.amount) {
    const user = await getUser(tx.wallet_address);
    return {
      created_at: tx.created_at,
      fullname: user.fullname,
      self_balance_change: toNano(tx.amount).toString(),
    };
  } else {
    return {
      created_at: tx.created_at,
      fullname: (await getUser(tx.wallet_address)).fullname,
      upgraded_pig_level: tx.upgraded_pig_level,
      self_balance_change: 0,
      //referral_depth: 0,
    };
  }
}

const levelsMap = (level: number) => {
  switch (level) {
    case 3:
      return 1;
    case 9:
      return 2;
    case 27:
      return 3;
    case 81:
      return 4;
    case 243:
      return 5;
    case 729:
      return 6;
    case 2187:
      return 7;
    case 6561:
      return 8;
    case 19683:
      return 9;
    case 59049:
      return 10;
    case 177147:
      return 11;
    case 531441:
      return 12;
    default:
      return 0;
  }
};

export function copyDictionary<K extends DictionaryKeyTypes, V>(
  obj: Dictionary<K, V>
): Dictionary<K, V> {
  let obj2: Dictionary<K, V> = Dictionary.empty<K, V>();

  obj.keys().forEach((key) => {
    obj2.set(key, obj.get(key)!);
  });

  return obj2;
}
