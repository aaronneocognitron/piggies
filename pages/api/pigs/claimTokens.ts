import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { ClaimTokensRequest, ClaimTokensResponse } from "@/models/claimTokens";
import { countReferralsByLevel } from "../user-tree/referrals";
import { pigsMapV2 } from "@/utils/pigs_map";
import { getTonCenterClient } from "@/utils/tonClients";
import { getAdminWallet } from "@/utils/admin";
import { ContractAddresses } from "../../../scripts/constants";
import { JettonWallet } from "@/../wrappers/JettonWallet";
import { Address, beginCell, toNano } from "@ton/core";
import { keyPairFromEnv } from "../../../scripts/helpers";

const pigsMap = pigsMapV2(undefined);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClaimTokensResponse>
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  const { telegram_id, wallet_address } = req.body as ClaimTokensRequest;

  if (!telegram_id || !wallet_address) {
    return res.status(400).json({
      success: false,
      message: "telegram_id or wallet_address is required",
    });
  }

  // Check if the user exists
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, wallet_address, current_pig, accrual_start, token_balance")
    .eq("telegram_id", telegram_id)
    .eq("wallet_address", wallet_address)
    .single();

  if (userError || !user) {
    console.error(userError);
    return res.status(404).json({ success: false, message: "User not found" });
  }

  if (!user.current_pig) {
    return res.status(400).json({ success: false, message: "User does not have pig" });
  }

  if (Date.now() - +new Date(user.accrual_start) <= 10 * 60 * 1000) {
    return res.status(429).json({ success: false, message: "Too many claims: please wait 10 minutes" });
  }

  const currentPig = pigsMap.find(pig => pig.code === user.current_pig);

  if (!currentPig) {
    return res.status(400).json({ success: false, message: "Cannot find pig info" });
  }

  const maxDepth = currentPig.level;

  const referralsByLevels = await countReferralsByLevel(
    user.id,
    maxDepth
  );

  const firstLevelDepthPigsCount = referralsByLevels
    .filter(r => r.depth === 1)
    .reduce((s, r) => s + r.users_count, 0);

  if (firstLevelDepthPigsCount < 3) {
    return res.status(400).json({ success: false, message: "Level 1 must be filled to claim tokens" });
  }

  if (user.current_pig > 1) {
    const referralsOfRequiredLevel = referralsByLevels
      .filter(r => r.current_pig >= user.current_pig)
      .reduce((s, r) => s + r.users_count, 0);

    if (referralsOfRequiredLevel < 3) {
      return res.status(400).json({ success: false, message: `At least 3 ${currentPig.className} (or higher) PIGs must be in your ${maxDepth}-level tree` });
    }
  }

  try {
    const { data: tokens=0 } = await supabase
      .rpc('settle_user_tokens', {
        p_user_id: user.id,
      });

    if (+tokens <= 1) {
      return res.status(400).json({ success: false, message: "Not enough tokens to claim" });
    }

    const tc = getTonCenterClient();
    const adminWallet = await getAdminWallet(tc);
    const secretKey = (await keyPairFromEnv()).secretKey;

    const pigTokenWallet = tc.open(JettonWallet.fromAddress(ContractAddresses.pigTokenWallet));

    await pigTokenWallet.send(
      adminWallet.sender(secretKey),
      { value: toNano("0.05") },
        {
          $$type: "JettonTransfer",
          queryId: BigInt(user.id),
          amount: toNano(tokens),
          destination: Address.parse(user.wallet_address),
          responseDestination: adminWallet.address,
          customPayload: null,
          forwardPayload: beginCell().storeUint(0, 1).asSlice(),
          forwardTonAmount: toNano('0.01'),
        }
    );

    const { error: updateError } = await supabase
        .from("users")
        .update({ token_balance: 0 })
        .eq("id", user.id);

    if (updateError) throw updateError;

    return res.status(200).json({
        success: true,
        tokens: tokens || 0,
    });
  } catch (error) {
    console.error("Error handling pig purchase:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to update pig value, message ${error}`,
    });
  }
}
