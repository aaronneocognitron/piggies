import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { ClaimTokensRequest, ClaimTokensResponse } from "@/models/claimTokens";
import {countReferralsByLevel} from "../user-tree/referrals";
import { pigsMapV2 } from "@/utils/pigs_map";

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
    .select("id, current_pig, accrual_start, token_balance")
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

    //TODO: send tokens, (add transaction to history?) and set token_balance to 0

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
