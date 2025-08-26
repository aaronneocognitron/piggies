// call the mint nft function on the contract
import {
  bountyHuntersResponse,
  extendedPigApprovalEvent,
  upgradeUserPigsInternalResponse,
} from "@/models/purchase";
import { supabase } from "../supabase";
import { txHistory, TxId } from "@/models/history";
import { PigLevel } from "@/models/pigs";
import { Address, fromNano } from "@ton/core";
import { BigIntMath } from "@/utils/BigIntMath";

// update the db based on the user purchase on the following fields
export const updateBountyHuntersBalances = async (
  bounty_hunters: bountyHuntersResponse
) => {
  const bh = bounty_hunters;
  //----------------------------------------------------
  // Step 1: updating user balances to update the db
  //----------------------------------------------------
  await Promise.all(bh.users.keys().map(async (userAddr) => {
    const { error } = await supabase
      .rpc("increment_piggy_bank_balance", {
        wallet_address_in: userAddr.toRawString(),
        amount_in: Number(bh.users.get(userAddr)),
      });

    if (error) {
      console.error(`Failed to update user ${userAddr.toRawString()}:`, error);
      throw new Error(
        `Failed to update user ${userAddr.toRawString()}: ${error}`
      );
    }
  }));
  //----------------------------------------------------
  // Step 2: updating admins balances to update the db
  //----------------------------------------------------
  await Promise.all(bh.admins.keys().map(async (adminAddr) => {
    const { error } = await supabase
      .rpc("increment_piggy_bank_balance", {
        wallet_address_in: adminAddr.toRawString(),
        amount_in: Number(bh.admins.get(adminAddr)),
      });

    if (error) {
      console.error(
        `Failed to update admin ${adminAddr.toRawString()}:`,
        error
      );
      throw new Error(
        `Failed to update admin ${adminAddr.toRawString()}: ${error}`
      );
    }
  }));
  //----------------------------------------------------
  // Step 3: updating referrer balances to update the db
  //----------------------------------------------------
  await Promise.all(bh.referrer.keys().map(async (referrerAddr) => {
    const { error } = await supabase
      .rpc("increment_piggy_bank_balance", {
        wallet_address_in: referrerAddr.toRawString(),
        amount_in: Number(bh.referrer.get(referrerAddr)),
      });

    if (error) {
      console.error(
        `Failed to update referrer ${referrerAddr.toRawString()}:`,
        error
      );
      throw new Error(
        `Failed to update referrer ${referrerAddr.toRawString()}: ${error}`
      );
    }
  }));
};

export const upgradeUserPig = async (userAddress: string) => {
  const { data, error: pigError } = await supabase
    .from("users")
    .select("current_pig")
    .eq("wallet_address", userAddress)
    .single();

  if (pigError || !data) {
    throw new Error(`Failed to fetch user ${userAddress}: ${pigError.message}`);
    return;
  }

  let currentPig = Number(data.current_pig ?? 0);

  // Cap at 4
  if (currentPig >= 4) {
    console.log(`User ${userAddress} is already at max pig level.`);
    return;
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ current_pig: currentPig + 1 })
    .eq("wallet_address", userAddress);

  if (updateError) {
    throw new Error(`Wallet update error: ${updateError.message}`);
  }
};

export const upgradeUserPigAddress = async (
  wallet_address: string,
  pig_address: string
) => {
  const { error: updateError } = await supabase
    .from("users")
    .update({ pig_address })
    .eq("wallet_address", wallet_address);

  if (updateError) {
    throw new Error(`Wallet update error: ${updateError.message}`);
  }
};

export const getPigs = async (
  userAddress: string
): Promise<upgradeUserPigsInternalResponse> => {
  const { data: current_pig, error: userError } = await supabase
    .from("users")
    .select("current_pig, pig_address")
    .eq("wallet_address", userAddress)
    .maybeSingle();

  let address: Address | null = null;

  if (current_pig?.pig_address !== null) {
    try {
      address = Address.parse(current_pig?.pig_address);
    } catch (error) {
      console.error("Error parsing pig address:", error);
    }
  }
  return {
    old_pig_level: current_pig?.current_pig ?? 0,
    new_pig_level: (current_pig?.current_pig ?? 0) + 1,
    address,
  };
};

export const initTxHistory = async (txData: txHistory): Promise<txHistory> => {
  const { data: tx, error: insertError } = await supabase
    .from("tx_history")
    .insert(txData)
    .select()
    .single();

  if (insertError) {
    throw new Error(
      `Wallet update error (initTxHistory): ${insertError.message}`
    );
  }
  return tx as txHistory;
};

export const updateTxHistory = async (
  txData: txHistory
): Promise<txHistory> => {
  const { data: tx, error: insertError } = await supabase
    .from("tx_history")
    .update(txData)
    .eq("tx_id", txData.tx_id)
    .select()
    .single();

  if (insertError) {
    throw new Error(
      `Wallet update error(updateTxHistory): ${insertError.message}`
    );
  }
  return tx as txHistory;
};

export async function updateReferralsRewardsHistory(
  event_data: extendedPigApprovalEvent
): Promise<boolean> {
  for (const user of Array.from(event_data.userBountyHunters.keys())) {
    const reward = event_data.userBountyHunters.get(user);
    const { error: insertError } = await supabase
      .from("rewards_history")
      .insert({
        wallet_address: user.toRawString(),
        reward: Number(reward),
        referral: event_data.userAddress.toRawString(),
        related_tx: event_data.tx_hash,
        reward_type: 'S',
      })
      .select()
      .single();

    console.log(
      `rewarded user ${user.toRawString()} with ${Number(fromNano(reward!))} TON`
    );

    if (insertError) {
      throw new Error(`Update users reward error: ${insertError.message}`);
    }
  }

  for (const admin of Array.from(event_data.adminsShares.keys())) {
    const reward = event_data.adminsShares.get(admin);
    const { error: insertError } = await supabase
      .from("rewards_history")
      .insert({
        wallet_address: admin.toRawString(),
        reward: Number(reward),
        referral: event_data.userAddress.toRawString(),
        related_tx: event_data.tx_hash,
        reward_type: 'A',
      })
      .select()
      .single();

    console.log(
      `rewarded admin ${admin.toRawString()} with ${Number(fromNano(reward!))} TON`
    );

    if (insertError) {
      console.error("Update admins reward error:", insertError);
    }
  }

  if (event_data.referrer) {
    for (const referrer of Array.from(event_data.referrer.keys())) {
      const reward = event_data.referrer.get(referrer);
      const { error: insertError } = await supabase
        .from("rewards_history")
        .insert({
          wallet_address: referrer.toRawString(),
          reward: Number(reward),
          referral: event_data.userAddress.toRawString(),
          related_tx: event_data.tx_hash,
          reward_type: 'R',
        })
        .select()
        .single();

      console.log(
        `rewarded referrer ${referrer.toRawString()} with ${Number(fromNano(reward!))} TON`
      );

      if (insertError) {
        throw new Error(`Update referrer reward error: ${insertError.message}`);
      }
    }
  }

  return true;
}

export async function isDuplicatePurchase(
  userAddress: string,
  pigLevel: PigLevel
): Promise<boolean> {
  let tx_id = TxId.create(userAddress, pigLevel);
  const { data: req, error: fetchError } = await supabase
    .from("tx_history")
    .select("request_status")
    .eq("tx_id", tx_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Error fetching tx history: ${fetchError.message}`);
  }
  if (req?.request_status && req.request_status === "PigPurchaseApproved") {
    return true;
  } else if (
    req?.request_status &&
    req.request_status === "PigUpgradePending"
  ) {
    return true;
  }

  return false;
}

export async function getPigsInfos() {
  const { data, error: fetchError } = await supabase
      .from("pig_levels")
      .select("level, price, balance_limit, tokens_per_day, token_limit");

  if (fetchError) throw fetchError;
  return data;
}

export async function getPigPrice(pigLevel: PigLevel) {
  const { data, error: fetchError } = await supabase
      .from("pig_levels")
      .select("price")
      .eq("level", pigLevel)
      .single();

  if (fetchError) throw fetchError;
  return data.price;
}

export async function UpdateUSerInTree(
  wallet_address: string,
  parent_id: string
) {
  const { error: updateError } = await supabase
    .from("users")
    .update({ parent_id: Number(parent_id) })
    .eq("wallet_address", wallet_address);

  if (updateError) {
    throw new Error(
      `Update user parent_id error (updateUserInTree): ${updateError.message}`
    );
  }
}

export async function getUserByReferralId(referral_id: string) {
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("referral_id", referral_id)
    .single();

  return user;
}

export async function getUsersByPigAddresses(pig_addresses: string[]) {
  const { data: users } = await supabase
    .from("users")
    .select("id, wallet_address, pig_address")
    .in("pig_address", pig_addresses);

  return users || [];
}

export async function getGenesisUser() {
  const { data: genesisUser } = await supabase
    .from("users")
    .select("id")
    .eq("user_type", 0)
    .single();

  return genesisUser;
}

export async function attachUserToTree(p_user_id: number, p_inviter_id: number) {
  const { data, error } = await supabase
    .rpc('attach_user_to_tree', {
      p_user_id,
      p_inviter_id,
    });

  if (error || !data) {
    throw new Error(
      `Failed to attach user to tree ${p_user_id} (inviter: ${p_inviter_id}): ${error?.message}`
    );
  }
  return data as number;
}

export async function updateUserPiggyBankBalance(
  userAddress: string,
  pigAddress: string,
  amount: bigint,
  tx_hash: string
) {
  amount = BigIntMath.round(amount);
  // fetch te user first to see if it exists and if its pig address is the same
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("piggy_bank_balance, pig_address")
    .eq("wallet_address", userAddress)
    .single();

  if (userError || !user) {
    throw new Error(
      `Failed to fetch user ${userAddress}: ${userError.message}`
    );
    return;
  }

  // comparing the balance and the pig address
  if (user.pig_address !== pigAddress) {
    throw new Error(
      `User ${userAddress} has a different pig address than the one in the db`
    );
  }
  if (BigInt(user.piggy_bank_balance) < amount) {
    console.warn(
      `User ${userAddress} has insufficient balance to withdraw ${amount}, setting balance to 0`
    );
  }

  const delta = BigIntMath.min(BigInt(user.piggy_bank_balance), amount);

  if (delta > BigInt(0)) {
    const {error: insertError} = await supabase
        .from("rewards_history")
        .insert({
          wallet_address: userAddress,
          reward: -Number(delta),
          referral: userAddress,
          related_tx: tx_hash,
          reward_type: 'W',
        })
        .select()
        .single();

    if (insertError) {
      console.error("Insert withdraw transaction error:", insertError);
    } else {
      console.log(
          `Inserted transaction of ${userAddress} to withdraw ${fromNano(delta)} TON`
      );
    }
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({
      piggy_bank_balance: Math.max(0, user.piggy_bank_balance - Number(amount)),
    })
    .eq("wallet_address", userAddress);

  if (updateError) {
    throw new Error(
      `Balance update error (updateUserPiggyBankBalance): ${updateError.message}`
    );
  }
}
