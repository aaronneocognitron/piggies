import { Address, toNano } from "@ton/core";
import { PigShop } from "../wrappers/PigShop";
import { ContractAddresses } from "./constants";
import { fromNano } from "@ton/ton";
import { supabase } from "@/utils/supabase";
import { getTonCenterClient } from "@/utils/tonClients";
import { getAdminWallet } from "@/utils/admin";
import { keyPairFromEnv } from "./helpers";

export async function run() {
  const tc = getTonCenterClient();
  const adminWallet = await getAdminWallet(tc);
  const pigShop = tc.open(PigShop.fromAddress(ContractAddresses.pigShop));

  const secretKey = (await keyPairFromEnv()).secretKey;

  console.log("Sending ChangeLimits message to PigShop at:", pigShop.address.toRawString());

  const levelsAndLimits = [
    {
      level: 1n, // Level 1
      price: toNano("4"),
      limit: toNano("20"),
    },
    {
      level: 2n, // Level 2
      price: toNano("40"),
      limit: toNano("200"),
    },
    {
      level: 3n, // Level 3
      price: toNano("400"),
      limit: toNano("2000"),
    },
    {
      level: 4n, // Level 4
      price: toNano("4000"),
      limit: toNano("20000"),
    }
  ] as { level: bigint, price: bigint, limit: bigint }[];

  for (const { level, price, limit } of levelsAndLimits) {
    // Send ChangeLimits message to update the limits
    await pigShop.send(
        adminWallet.sender(secretKey),
        { value: toNano("0.01") },
        {
          $$type: "ChangeLimits",
          level,
          limit,
        }
    );

    await new Promise(res => setTimeout(res, 10000));

    console.log(`ChangeLimits message sent for level ${level.toString()} with limit ${fromNano(limit)} TON`);

    const { error } = await supabase.from("pig_levels").update({
      price: Number(price),
      balance_limit: Number(limit),
    }).eq("level", Number(level));

    if (error) console.error(error);
    else console.log(`Pig price for level ${level.toString()} updated to ${fromNano(price)} TON`);
  }

  console.log("All ChangeLimits messages sent successfully!");
}

run().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
