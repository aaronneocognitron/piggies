import { supabase } from "@/utils/supabase";
import { User } from "@/models/userTree";
import { bountyHuntersResponse } from "@/models/purchase";
import { Address, Dictionary, toNano } from "@ton/core";
import { PigLevel } from "@/models/pigs";
import { pigsMapV2 } from "../pigs_map";
import { Pig } from "../../../wrappers/Pig";
import { getPigPrice } from "@/utils/purchase/dbOps";

export async function findUsersBountyHunters(
  walletAddress: string,
  upgradedPigLevel: PigLevel
): Promise<bountyHuntersResponse> {
  try {
    if (upgradedPigLevel === 0) {
      throw new Error("upgradedPigLevel must be greater than 0");
    }

    // ----------------------------------------------------
    // Step 1: Fetch the user it self
    // ----------------------------------------------------

    const { data: user, error: tgIdError } = await supabase
      .from("users")
      .select()
      .eq("wallet_address", walletAddress)
      .single();

    if (tgIdError || !user) {
      throw new Error("User not found via Addr");
    }

    // ----------------------------------------------------
    // Step 2: Fetch the user referrer
    // ----------------------------------------------------
    const { data: referrer, error: referrerError } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("id", user.inviter_id)
      .single();

    if (referrerError || !referrer) {
      throw new Error("referrer not found via user.inviter_id");
    }

    //----------------------------------------------------
    const upperUsers: User[] = [];
    const admins: User[] = [];
    const userIdsToFetch: string[] = [];
    const upperUsersLimit = {
      [1]: 3,
      [2]: 12,
      [3]: 12,
      [4]: 12,
    }[upgradedPigLevel];

    let currentUserId: string | null = user.id;
    //----------------------------------------------------

    // ----------------------------------------------------
    // Step 3: Fetching the upper users
    // ----------------------------------------------------
    for (let i = 0; i < upperUsersLimit; i++) {
      if (!currentUserId) break;

      const { data: parent, error: parentError } = await supabase
        .from("users")
        .select("id, parent_id")
        .eq("id", currentUserId)
        .single();

      if (parentError || !parent || !parent.parent_id || parent.parent_id < 0)
        break;

      userIdsToFetch.push(parent.parent_id);
      currentUserId = parent.parent_id;
    }

    // ----------------------------------------------------
    // Step 4: Fetching the upper users details and checking the eligibility
    // ----------------------------------------------------
    if (userIdsToFetch.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select(
          "id, telegram_id, wallet_address, current_pig, fullname, inviter_id, user_type"
        )
        .in("id", userIdsToFetch);

      if (usersError || !users) {
        throw new Error("Failed to fetch upper users: " + usersError?.message);
      }

      const lowerUsersLimits = {
        [1]: 3,
        [2]: 7,
        [3]: 10,
        [4]: 12,
      };

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const depthIndex = userIdsToFetch.indexOf(user.id);
        if (user.current_pig >= upgradedPigLevel && depthIndex < (lowerUsersLimits[user.current_pig as keyof typeof lowerUsersLimits] ?? 0)) {
          const totalInvited = await calcTotalInvited(user.id);
          upperUsers.push({
            telegram_id: user.telegram_id,
            wallet_address: user.wallet_address || "",
            current_pig: user.current_pig ?? 0,
            fullname: user.fullname || "",
            inviter_id: user.inviter_id || "",
            total_invited: totalInvited,
            user_type: user.user_type,
          });
        }
      }
    }

    // ----------------------------------------------------
    // Step 4: Fetching the admins
    // ----------------------------------------------------
    const { data: wholeAdmins, error: usersError } = await supabase
      .from("users")
      .select(
        "id, telegram_id, wallet_address, current_pig, fullname, inviter_id, user_type"
      )
      .eq("user_type", 0);

    if (!wholeAdmins) {
      throw new Error("No Admins found");
    }

    for (const admin of wholeAdmins) {
      admins.push({
        ...admin,
        total_invited: await calcTotalInvited(admin.id),
      });
    }

    // ----------------------------------------------------
    // Step 5: Updating the upper users, admins and the referrer shares
    // ----------------------------------------------------

    let usersDic = Dictionary.empty<Address, bigint>();
    let adminsDic = Dictionary.empty<Address, bigint>();
    let referrerDic = Dictionary.empty<Address, bigint>();
    const pigCostInNano = BigInt(await getPigPrice(upgradedPigLevel));

    upperUsers.map((user) => {
      return usersDic.set(
        Address.parse(user.wallet_address),
        calcShares("user", upgradedPigLevel, pigCostInNano)
      );
    });
    admins.map((admin) => {
      // it should be one admin

      adminsDic.set(
        Address.parse(admin.wallet_address),
        calcShares("admin", upgradedPigLevel, pigCostInNano)
      );
    });

    // -- Updating referrer share

    referrerDic.set(
      Address.parse(referrer.wallet_address),
      calcShares("referrer", upgradedPigLevel, pigCostInNano)
    );

    // ----------------------------------------------------
    // Step 6: Calc if any money is left to assign to the admin
    // ----------------------------------------------------
    let totalPayments = referrerDic
      .values()
      .concat(usersDic.values())
      .concat(adminsDic.values());
    let totalPaymentsSum = totalPayments.reduce((a, b) => a + b, BigInt(0));
    // console.log("totalPaymentsSum", totalPaymentsSum);
    // console.log("admin dictionaries:", adminsDic);
    // console.log("user dictionaries:", usersDic);
    // console.log("referrer dictionaries:", referrerDic);
    let change = pigCostInNano - totalPaymentsSum;
    if (change > BigInt(0)) {
      const eachAdminShare = change / BigInt(adminsDic.keys().length);
      console.log("eachAdminShare", eachAdminShare);
      for (const key of adminsDic.keys()) {
        const currentValue = adminsDic.get(key) || BigInt(0);
        console.log("currentValue", currentValue);
        adminsDic.set(key, currentValue + eachAdminShare);
      }
    }

    // ----------------------------------------------------
    // Step 6: Check if there is any money assigned to admin(genesis) in the users or in referrer and moving it into the admins side
    // ----------------------------------------------------
    let adminAddress: Address = adminsDic.keys()[0];
    for (const key of usersDic.keys()) {
      if (key.toString() === adminAddress.toString()) {
        const valToMove = usersDic.get(key) || BigInt(0);
        const adminValToTopUp = adminsDic.get(key) || BigInt(0);
        adminsDic.set(adminAddress, adminValToTopUp + valToMove);
        usersDic.delete(key);
      }
    }

    // console.log("usersDic", usersDic);
    // console.log("referrerDic", referrerDic);
    // console.log("adminsDic", adminsDic);

    return {
      referrer: referrerDic,
      users: usersDic,
      admins: adminsDic,
    };
  } catch (error) {
    throw new Error(`Error fetching upper users and admins${error}`);
  }
}

async function calcTotalInvited(userId: string): Promise<number> {
  try {
    const totalInvited =
      (await supabase.from("users").select("id").eq("inviter_id", userId)).data
        ?.length || 0;

    return totalInvited;
  } catch (error) {
    throw new Error(`Error calculating total invited ${userId}`);
  }
}

function calcShares(
  role: "admin" | "user" | "referrer",
  upgradedPigLevel: PigLevel,
  pigCostInNano: bigint
): bigint {
  const userSharePercentage = upgradedPigLevel === 1 ? 20n : 5n;
  switch (role) {
    case "admin":
      return (pigCostInNano * 20n) / 100n;
    case "referrer":
      return (pigCostInNano * 20n) / 100n;
    case "user":
      return (pigCostInNano * userSharePercentage) / 100n;
    default:
      return 0n;
  }
}

export async function BountyHuntersForPigApproval(
  bh: bountyHuntersResponse
): Promise<bountyHuntersResponse> {
  let PA_BH: bountyHuntersResponse = {
    referrer: Dictionary.empty<Address, bigint>(),
    users: Dictionary.empty<Address, bigint>(),
    admins: Dictionary.empty<Address, bigint>(),
  };
  for (const user of bh.users.keys()) {
    const { data: pig, error: pigError } = await supabase
      .from("users")
      .select("pig_address")
      .eq("wallet_address", user.toRawString())
      .single();

    if (pigError || !pig) {
      throw new Error("Failed to fetch pig: " + pigError?.message);
    }

    PA_BH.users.set(Address.parse(pig.pig_address), bh.users.get(user)!);
  }

  // fixing the referrer pig address
  if (bh.referrer.keys().length > 0) {
    const referrerAddress = bh.referrer.keys()[0];
    const { data: pig, error: pigError } = await supabase
      .from("users")
      .select("pig_address")
      .eq("wallet_address", referrerAddress.toRawString())
      .single();

    if (pigError || !pig) {
      throw new Error("Failed to fetch referrer pig: " + pigError?.message);
    }

    PA_BH.referrer.set(
      Address.parse(pig.pig_address),
      bh.referrer.get(referrerAddress)!
    );
  }

  // setting the admins shares of the new bh
  for (const [key, value] of bh.admins) {
    PA_BH.admins.set(key, value);
  }

  return PA_BH;
}
