import {
  bountyHuntersResponse,
  extendedPigApprovalEvent,
  extendedPigCreationEvent,
  extendedPigUpgradeEvent,
  extendedWithdrawFromPigEvent,
} from "../../models/purchase";
import { TxId } from "../../models/history";
import { TonApiClient } from "@ton-api/client";
import {
  Address,
  contractAddress,
  Dictionary,
  OpenedContract,
} from "@ton/core";
import {
  loadPigApproval,
  loadPigApprovalEvent,
  loadPigCreationEvent,
  loadUpgradePig,
  loadWithdrawFromPigEvent,
  PigCreationEvent,
  PigShop,
  WithdrawFromPigEvent,
} from "../../../build/PigShop/tact_PigShop";

import {
  BountyHuntersForPigApproval,
  findUsersBountyHunters,
} from "./bountyHunters";
import { getAdminWallet } from "../admin";
import { getTonApiClient, getTonCenterClient } from "../tonClients";
import { get } from "http";
import { sendPigApproval } from "../../../scripts/pigApproval";
import {
  attachUserToTree,
  getGenesisUser, getPigPrice,
  getPigs, getUsersByPigAddresses,
  initTxHistory,
  isDuplicatePurchase,
  updateBountyHuntersBalances,
  updateReferralsRewardsHistory,
  updateTxHistory,
  UpdateUSerInTree,
  updateUserPiggyBankBalance,
  upgradeUserPig,
  upgradeUserPigAddress,
} from "./dbOps";
import { PigLevel } from "../../models/pigs";
import { WithdrawFromNftPig } from "../../../wrappers/Pig";
import { ContractAddresses } from "../../../scripts/constants";
import { getUser } from "../helpers";
import { PigCollection } from "../../../wrappers/PigCollection";
import { TonClient, WalletContractV5R1 } from "@ton/ton";

async function catchPigShopEvents(
  adminWallet: OpenedContract<WalletContractV5R1>,
  PigShopContract: OpenedContract<PigShop>,
  PigCollectionContract: OpenedContract<PigCollection>,
  tonCenterClient: TonClient,
  tonAPiClient: TonApiClient,
  after_lt?: bigint
) {
  console.log("➡️ Starting to catch PigShop events");
  console.log("🔍 Listen address:", ContractAddresses.pigShop.toString());
  console.log("📌 Last known lt:", after_lt?.toString());

  const txs = await tonAPiClient.blockchain.getBlockchainAccountTransactions(
    ContractAddresses.pigShop,
    {
      limit: after_lt ? 10 : 1,
      after_lt,
    }
  );

  if (txs && txs.transactions.length === 0) {
    console.log("⚠️ No new transactions found");
    return after_lt;
  }
  console.log("📦 Transactions fetched:", txs.transactions.length);

  let events: Array<
    | extendedPigUpgradeEvent
    | extendedPigApprovalEvent
    | extendedPigCreationEvent
    | extendedWithdrawFromPigEvent
    | undefined
  > = [];

  for (const tx of txs.transactions) {
    console.log("🔁 Processing transaction:", tx.hash);

    if (!tx.computePhase?.success || !tx.actionPhase?.success || tx.aborted) {
      console.log("🚫 Skipped aborted or failed tx:", tx.hash);
      continue;
    }

    if (tx.inMsg?.rawBody === undefined) {
      console.log("⚠️ Skipped tx with no body:", tx.hash);
      continue;
    }

    for (const msg of tx.outMsgs) {
      console.log(
        "💬 Out message:",
        Object.entries({ ...PigCollection.opcodes, ...PigShop.opcodes }).find(
          ([key, value]) => BigInt(value) === msg.opCode
        )?.[0]
      );

      try {
        if (
          msg.msgType === "ext_out_msg" &&
          msg.opCode === BigInt(PigShop.opcodes.UpgradePig) &&
          msg.rawBody
        ) {
          events.push({
            ...loadUpgradePig(msg.rawBody?.asSlice()),
            tx_hash: tx.hash,
          });
          console.log("✅ Detected UpgradePig event");
        } else if (
          msg.msgType === "ext_out_msg" &&
          msg.opCode === BigInt(PigShop.opcodes.PigApprovalEvent) &&
          msg.rawBody
        ) {
          events.push({
            ...loadPigApprovalEvent(msg.rawBody?.asSlice()),
            tx_hash: tx.hash,
          });
          console.log("✅ Detected PigApprovalEvent");
        } else if (
          msg.msgType === "ext_out_msg" &&
          msg.opCode === BigInt(PigShop.opcodes.WithdrawFromPigEvent) &&
          msg.rawBody
        ) {
          events.push({
            ...loadWithdrawFromPigEvent(msg.rawBody?.asSlice()),
            tx_hash: tx.hash,
          });
          console.log("✅ Detected WithdrawFromPigEvent");
        } else if (
          msg.msgType === "ext_out_msg" &&
          msg.opCode === BigInt(PigShop.opcodes.PigCreationEvent) &&
          msg.rawBody
        ) {
          events.push({
            ...loadPigCreationEvent(msg.rawBody?.asSlice()),
            tx_hash: tx.hash,
          });
          console.log("✅ Detected PigCreationEvent");
        }
      } catch (e) {
        console.log("❌ Error decoding message:", msg.decodedOpName, e);
        continue;
      }
    }
  }
  console.log("the parsed events are", events);
  if (!after_lt) {
    const nextLt = txs.transactions[txs.transactions.length - 1].lt;
    console.log(
      "⏭️Not processing the old event and Returning next lt:",
      nextLt.toString()
    );

    return nextLt;
  }

  for (const event of events) {
    if (event && event.userAddress) {
      console.log(
        "📍 Processing event for user:",
        event.userAddress.toString()
      );

      const userAddr = event.userAddress.toRawString();
      const [user, pig_data] = await Promise.all([
          getUser(userAddr),
          getPigs(userAddr),
      ]);
      console.log("🐷 Pig data loaded:", pig_data);

      if (pig_data.old_pig_level === 0 && !pig_data.address) {
        const { id: user_id_to_attach, inviter_id, parent_id } = user;
        if (!parent_id) {
          // set the parent pig in ternary subtree with root = inviter
          const new_parent_id = await attachUserToTree(user_id_to_attach, inviter_id);
          console.log("🌳 Attached user to parent:", user_id_to_attach, '->', new_parent_id);
        }
      }

      const bh = await findUsersBountyHunters(userAddr, pig_data.new_pig_level);
      console.log("🏹 Bounty hunters fetched:", bh);

      if (event.$$type === "UpgradePig") {
        console.log("🛠️ Handling UpgradePig event");

        const minPrice = BigInt(await getPigPrice(pig_data.new_pig_level));
        const amount = event.amount;

        console.log("💸 New pig price:", minPrice.toString(), "user sent:", amount.toString());

        if (amount >= minPrice) {
          const isDup = await isDuplicatePurchase(
              userAddr,
              pig_data.new_pig_level
          );
          console.log("🔁 Is duplicate purchase?", isDup);

          if (!isDup) {
            console.log(
                "⁉️ UpgradePig tx initiated check for potential user tree update ..."
            );

            const tx_id = TxId.create(userAddr, pig_data.new_pig_level);

            console.log("🚀 Sending pig approval message");
            await sendPigApproval(
                await BountyHuntersForPigApproval(bh),
                adminWallet,
                PigShopContract,
                pig_data.address,
                userAddr
            );

            await initTxHistory({
              tx_id,
              tx_hash: event.tx_hash,
              wallet_address: userAddr,
              request_status: "PigUpgradePending",
              upgraded_pig_level: pig_data.new_pig_level,
            });

            console.log("📜 Tx history initialized for UpgradePig");
          }
        }
      }

      if (event.$$type === "PigApprovalEvent") {
        console.log("✅ Approval received for:", userAddr);

        const bountyHuntersPigAddresses: Address[] = [event.referrerNftAddress]
          .concat(event.userBountyHunters.keys())
          .concat(event.adminsShares.keys());

        const bountyHuntersArr = await getUsersByPigAddresses(
          bountyHuntersPigAddresses.map(addr => addr.toRawString())
        );

        const bountyHunters = Dictionary.empty<Address, Address>();
        for (const bountyHunter of bountyHuntersArr) {
          bountyHunters.set(
            Address.parseRaw(bountyHunter.pig_address),
            Address.parseRaw(bountyHunter.wallet_address)
          );
        }

        event.referrer = Dictionary.empty<Address, bigint>().set(
          bountyHunters.get(event.referrerNftAddress) ?? event.referrerNftAddress,
          event.referrerAmount
        );

        const userBountyHunters = Dictionary.empty() as (typeof event)["userBountyHunters"];
        for (const bhPigAddress of event.userBountyHunters.keys()) {
          userBountyHunters.set(
            bountyHunters.get(bhPigAddress) ?? bhPigAddress,
            event.userBountyHunters.get(bhPigAddress)!,
          );
        }
        event.userBountyHunters = userBountyHunters;

        const adminsShares = Dictionary.empty() as (typeof event)["adminsShares"];
        for (const bhPigAddress of event.adminsShares.keys()) {
          adminsShares.set(
            bountyHunters.get(bhPigAddress) ?? bhPigAddress,
            event.adminsShares.get(bhPigAddress)!,
          );
        }
        event.adminsShares = adminsShares;

        console.log("👔 Updated the referrer amount for:", event.referrer);

        //-----------------------------------------
        // update the bounty hunter balances (piggy_bank_balance on the users table)
        //-----------------------------------------

        await updateBountyHuntersBalances({
          referrer: event.referrer,
          users: event.userBountyHunters,
          admins: event.adminsShares,
        });

        //-----------------------------------------
        // update the user pig (current_pig on the users table)
        //-----------------------------------------
        await upgradeUserPig(userAddr);

        //-----------------------------------------
        // update the transaction history (tx_history table)
        //-----------------------------------------
        await updateTxHistory({
          tx_id: TxId.create(userAddr, pig_data.new_pig_level),
          tx_hash: event.tx_hash,
          wallet_address: userAddr,
          request_status: "PigPurchaseApproved",
          upgraded_pig_level: pig_data.new_pig_level,
        });

        //-----------------------------------------
        // update the referrals rewards history (rewards_history table)
        //-----------------------------------------
        const updateRes = await updateReferralsRewardsHistory(event);
        console.log("📦 Referral reward update:", updateRes);

        if (!updateRes)
          throw new Error("Failed to update referrals rewards history!");
      }

      if (event.$$type === "PigCreationEvent") {
        console.log("🐣 Handling PigCreationEvent");
        //-----------------------------------------
        // update the user pig address (pig_address on the users table)
        //-----------------------------------------
        await upgradeUserPigAddress(userAddr, event.nft.toRawString());
        console.log("✅ User pig address upgraded");
      }

      if (event.$$type === "WithdrawFromPigEvent") {
        console.log("🏧 Handling WithdrawFromPigEvent");
        //-----------------------------------------
        // update the user piggy bank balance (piggy_bank_balance on the users table and rewards_history table)
        //-----------------------------------------

        await updateUserPiggyBankBalance(
          userAddr,
          event.nft.toRawString(),
          event.amount,
          event.tx_hash
        );
        console.log("💰 User piggy bank balance updated");
      }
    } else {
      console.log("⚠️ No event with userAddress was detected");
    }
  }

  const nextLt = txs.transactions[txs.transactions.length - 1].lt;
  console.log("⏭️ Returning next lt:", nextLt.toString());

  return nextLt;
}

export async function listenPigShopForever() {
  console.log("🔁 Starting to listen for PigShop events");
  try {
    let lastLt;

    const tc = getTonCenterClient();
    const tac = getTonApiClient();
    const adminWallet = await getAdminWallet(tc);

    console.log("👛 Admin wallet loaded:", adminWallet.address.toString());

    const pigShop = tc.open(PigShop.fromAddress(ContractAddresses.pigShop));
    const pigCollection = tc.open(PigCollection.fromAddress(ContractAddresses.pigsCollection));

    console.log("🏪 PigShop contract opened at:", pigShop.address.toString());

    while (true) {
      try {
        lastLt = await catchPigShopEvents(
          adminWallet,
          pigShop,
          pigCollection,
          tc,
          tac,
          lastLt
        );

        // waiting for 1 second before checking the next lt
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error in listenPigShopForever:", error);
        console.log("restarting...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  } catch (error) {
    console.error("Error in listenPigShopForever:", error);
    console.log("restarting...");
  }
}
