// Assuming you have imported necessary TON SDK modules
import {
  TonClient,
  WalletContractV4,
  WalletContractV5R1,
  internal,
  toNano,
} from "@ton/ton";
import { beginCell, Address, Dictionary, OpenedContract } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import {
  PigApproval,
  PigShop,
  storePigApproval,
} from "../build/PigShop/tact_PigShop";
import { bountyHuntersResponse } from "@/models/purchase";
import { keyPairFromEnv } from "./helpers";

export async function sendPigApproval(
  bh: bountyHuntersResponse,
  wallet: OpenedContract<WalletContractV5R1>,
  pigShop: OpenedContract<PigShop>,
  pig: Address | null,
  mainUser: string
) {
  try {
    let secretKey = (await keyPairFromEnv()).secretKey;

    const approvalMsg: PigApproval = {
      $$type: "PigApproval",
      userBountyHunters: bh.users,
      adminsShares: bh.admins,
      userAddress: Address.parse(mainUser),
      referrerNftAddress: bh.referrer.keys()[0] || null,
      referrerAmount: bh.referrer.values()[0] || BigInt(0) ,
      pig,
    };

    await pigShop.send(
      wallet.sender(secretKey),
      {
        value: BigInt(bh.users.size + bh.referrer.size + bh.admins.size) * toNano("0.005") + (!!pig ? toNano('0.02') : toNano('0.135')) + toNano('0.015'),
      },
      approvalMsg
    );

    console.log("PigApproval message sent.");
  } catch (err) {
    console.error("error sending the pig approval", err);
  }

}




