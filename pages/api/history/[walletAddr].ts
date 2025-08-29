import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { PurchasePigResponse } from "@/models/purchase";
import { UserHistory } from "@/models/history";
import { prepareUserHistoryObj } from "@/utils/helpers";
import { PigLevel } from "@/models/pigs";

/**
 * @swagger
 * /api/history/{walletAddr}:
 *   get:
 *     summary: Retrieve combined transaction and reward history for a user
 *     description: >
 *       Retrieves a combined and time-sorted array of transaction and reward history for a user,
 *       based on their wallet address. Data is aggregated from the `txHistory` and `rewardsHistory` tables,
 *       transformed into unified history objects.
 *     parameters:
 *       - in: path
 *         name: walletAddr
 *         required: true
 *         description: Wallet address to retrieve history for
 *         schema:
 *           type: string
 *           example: "0xabc123...789"
 *     responses:
 *       200:
 *         description: Successfully retrieved user's transaction and reward history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: array
 *                   description: Array of combined UserHistory items
 *                   items:
 *                     type: object
 *                     properties:
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-05-01T14:48:00.000Z"
 *                       fullname:
 *                         type: string
 *                         example: "Jane Doe"
 *                       upgraded_pig_level:
 *                         type: integer
 *                         example: 2
 *                       self_balance_change:
 *                         type: number
 *                         example: -3
 *                       referral_depth:
 *                         type: integer
 *                         example: 1
 *       400:
 *         description: Invalid or missing wallet address
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid or missing wallet address"
 *       404:
 *         description: Wallet not connected or no data found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Wallet is not connected !"
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Server error or failed history aggregation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   oneOf:
 *                     - type: string
 *                       example: "internal server error"
 *                     - type: array
 *                       items:
 *                         type: object
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PurchasePigResponse>
) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  const { walletAddr } = req.query;

  if (!walletAddr || typeof walletAddr !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or missing wallet address" });
  }

  try {
    // Check if the user exists
    const { data: wallet_address, error: userError } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("wallet_address", walletAddr)
      .single();

    if (userError || !wallet_address) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet is not connected !" });
    }

    const [
        { data: userTxs, error: txError },
        { data: userRewards, error: RewardsError },
        { data: userTokenWithdraws, error: withdrawsError },
    ] = await Promise.all([
        supabase
            .from("tx_history")
            .select("tx_id, tx_hash, wallet_address, request_status, upgraded_pig_level, created_at")
            .eq("wallet_address", wallet_address.wallet_address),
        supabase
            .from("rewards_history")
            .select("wallet_address, reward, referral, related_tx, created_at, reward_type")
            .eq("wallet_address", wallet_address.wallet_address),
        supabase
            .from("token_withdrawal_history")
            .select("wallet_address, amount, related_tx, created_at")
            .eq("wallet_address", wallet_address.wallet_address),
    ]);

    if (txError) throw new Error(txError.message);
    if (RewardsError) throw new Error(RewardsError.message);
    if (withdrawsError) throw new Error(withdrawsError.message);

    const histories: UserHistory[] = [];

    for (const tx of userTxs) {
      histories.push(await prepareUserHistoryObj(tx));
    }

    for (const reward of userRewards) {
      histories.push(await prepareUserHistoryObj(reward));
    }

    for (const withdraw of userTokenWithdraws) {
      histories.push(await prepareUserHistoryObj(withdraw));
    }

    histories.sort(
        (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let pigLevel = userTxs?.length ? userTxs.reduce<PigLevel>((m, v) =>
        Math.max(m, v.upgraded_pig_level) as PigLevel,
        0 as PigLevel
    ) : 0;

    for (const history of histories) {
      if (history.self_balance_change < 0) {
        history.upgraded_pig_level = pigLevel;
      } else if (history.self_balance_change === 0) {
        pigLevel = history.upgraded_pig_level - 1;
      }
    }

    return res.status(200).json({ success: true, message: histories });
  } catch (error) {
    console.error("Error fetching user history:", error);
    return res.status(500).json({ success: false, message: String(error) });
  }
}
