import { supabase } from "../supabase";
import { Address } from "@ton/core";
import { ClaimTokensResponse } from "@/models/claimTokens";

export async function handleClaimTokens(
  userAddress: string,
  queryId: number | bigint
): Promise<ClaimTokensResponse> {
  
  let userAddr = Address.parse(userAddress);

  // sleeping for 6 seconds to simulate the time it takes to process the transaction
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // checking the db
  let found = false;
  let max_retries = 10;
  let retries = 0;
  let backoff_secs = 3000;
  while (!found) {
    await new Promise((resolve) => setTimeout(resolve, backoff_secs));
    const { data: tx, error: fetchError } = await supabase
      .from("token_withdrawal_history")
      .select()
      .eq("wallet_address", userAddr.toRawString())
      .eq("query_id", queryId)
      .single();

    if (retries > max_retries) {
      throw new Error("Max retries exceeded ! Transaction not found !");
    }

    if (fetchError || !tx) {
      continue;
    }

    found = true;
    return {
        success: true,
        tokens: tx.amount,
    };
  }

  return {
    success: false,
    message: "couldn't process you request, contact to support team",
  };
}
