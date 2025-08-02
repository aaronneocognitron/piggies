import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { cookies } from "next/headers";
import { RegisterRequest } from "@/models/register";
import { getGenesisUser, getUserByReferralId } from "@/utils/purchase/dbOps";

/**
 * @swagger
 * /api/register:
 *   post:
 *     summary: Registers a new user in the system
 *     description: This endpoint registers a new user using a telegram_id and optionally a referral_id. If the referral_id is provided, the user will be placed under the inviter in the user tree.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               telegram_id:
 *                 type: string
 *                 description: The unique Telegram ID of the user.
 *                 example: "123456789"
 *               referral_id:
 *                 type: string
 *                 description: The referral ID of the inviter. If omitted, the user will be registered as a root user.
 *                 example: "987654321"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   description: The newly registered user object.
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "abc123"
 *                     telegram_id:
 *                       type: string
 *                       example: "123456789"
 *       400:
 *         description: Bad Request if required fields are missing or invalid
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
 *                   example: "telegram_id is required"
 *       409:
 *         description: Conflict if the user is already registered
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
 *                   example: "User already registered"
 *       500:
 *         description: Internal Server Error if there was a problem with the database
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
 *                   example: "Database insert error"
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "PATCH") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  const { telegram_id, referral_id, wallet_address, fullname } =
    req.body as RegisterRequest;

    console.log(telegram_id, referral_id, wallet_address, fullname, req.body as RegisterRequest)

    
  if (!telegram_id || !wallet_address) {
    return res.status(400).json({
      success: false,
      message: "telegram_id and wallet_address are required",
    });
  }

  const [{ data: user }, { id: inviter_id }] = await Promise.all([
    supabase
      .from("users")
      .select()
      .eq("wallet_address", wallet_address)
      .maybeSingle(),
      (referral_id ? getUserByReferralId(String(referral_id)) : Promise.resolve(null))
          .then(res => res || { id: null }),
  ]);

  // user exists
  if (user) {
    const { data: updateData, error } = await supabase
      .from("users")
      .update({
        telegram_id: telegram_id,
        fullname: fullname,
        inviter_id: ((user.current_pig || referral_id === process.env.NEXT_PUBLIC_DEFAULT_REFFERAL_ID) ? undefined : inviter_id) || user.inviter_id,
      })
      .eq("wallet_address", wallet_address)
      .select()
      .single();
    if (error) {
      console.error("Error updating user:", error);
      return res
        .status(500)
        .json({ success: false, message: `Database update error ${error}` });
    }
    return res.status(200).json({ success: true, user: updateData });
  }

  const { data: insertData, error } = await supabase
    .from("users")
    .insert({
      telegram_id: telegram_id,
      inviter_id: inviter_id || (await getGenesisUser())!.id,
      parent_id: null,
      fullname: fullname,
      wallet_address: wallet_address,
      user_type: 1,
    })
    .select() // select the inserted row to return it
    .single();

  if (error) {
    console.error("Error inserting user:", error);
    return res
      .status(500)
      .json({ success: false, message: `Database insert error ${error}` });
  }

  // Successfully inserted
  return res.status(201).json({ success: true, user: insertData });
}
