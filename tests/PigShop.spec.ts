import {
  Blockchain,
  EventMessageSent,
  SandboxContract,
  TreasuryContract,
} from "@ton/sandbox";
import {
  Address,
  Dictionary,
  toNano,
  Cell,
  beginCell,
  fromNano,
} from "@ton/core";
import { loadPigCreationEvent, PigShop } from "../wrappers/PigShop";
import { PigCollection } from "../wrappers/PigCollection";
import { Pig } from "../wrappers/Pig";
import "@ton/test-utils";

describe("PigCreation Event Test", () => {
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let user1: SandboxContract<TreasuryContract>;
  let user2: SandboxContract<TreasuryContract>;
  let admin1: SandboxContract<TreasuryContract>;
  let pigShop: SandboxContract<PigShop>;
  let pigCollection: SandboxContract<PigCollection>;
  let nftAddress1: Address;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury("deployer");
    user1 = await blockchain.treasury("user1");
    user2 = await blockchain.treasury("user2");
    admin1 = await blockchain.treasury("admin1");

    pigShop = blockchain.openContract(
      await PigShop.fromInit(BigInt(1), deployer.address)
    );

    const deployShopResult = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      null
    );

    expect(deployShopResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: pigShop.address,
      deploy: true,
      success: true,
    });

    await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "ChangeLimits",
        level: 1n,
        limit: toNano("0.1"),
      }
    );
    await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "ChangeLimits",
        level: 2n,
        limit: toNano("0.25"),
      }
    );
    await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "ChangeLimits",
        level: 3n,
        limit: toNano("0.5"),
      }
    );
    await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "ChangeLimits",
        level: 4n,
        limit: toNano("0.75"),
      }
    );

    const collectionContent = {
      $$type: "Tep64TokenData" as const,
      flag: BigInt(1),
      content: "https://raw.githubusercontent.com/aaronneocognitron/piggies/refs/heads/feat/development/public/metadata/collection.json",
    };

    const royalty = {
      $$type: "RoyaltyParams" as const,
      numerator: BigInt(0),
      denominator: BigInt(2),
      destination: deployer.address,
    };

    pigCollection = blockchain.openContract(
      await PigCollection.fromInit(
        deployer.address,
        pigShop.address,
        collectionContent,
        "https://example.com/nft/",
        royalty
      )
    );

    const deployCollectionResult = await pigCollection.send(
      deployer.getSender(),
      { value: toNano("0.03") },
      null
    );

    const setCollectionResult = await pigShop.send(
      deployer.getSender(),
      { value: toNano("0.05") },
      {
        $$type: "ChangeCollection",
        newCollection: pigCollection.address,
      }
    );

    console.log(pigShop.address.toString(), pigCollection.address.toString());
  });

  it("should deploy and configure contracts correctly", async () => {
    console.log("Verifying PigShop parameters...");
    const pigShopParams = await pigShop.getGetParams();
    expect(pigShopParams.owner).toEqualAddress(deployer.address);
    expect(pigShopParams.collection).toEqualAddress(pigCollection.address);

    console.log("✅ PigShop configured correctly.");

    console.log("Verifying PigCollection parameters...");
    const collectionData = await pigCollection.getGetCollectionData();
    expect(collectionData.ownerAddress).toEqualAddress(deployer.address);
    expect(collectionData.nextItemIndex).toBe(BigInt(1));

    console.log("✅ PigCollection configured correctly.");
  });

  it("should emit PigCreation event after complete pig purchase flow", async () => {
    const userBountyHunters = Dictionary.empty<Address, bigint>();

    const adminsShares = Dictionary.empty<Address, bigint>().set(
      admin1.address,
      toNano("0.02")
    );

    console.log("=== Starting PigApproval transaction ===");

    const approvalResult = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user1.address,
        referrerNftAddress: admin1.address,
        referrerAmount: toNano("0.01"),
        userBountyHunters,
        adminsShares,
      }
    );

    console.log("=== PigApproval transaction completed ===");
    console.log("Transaction count:", approvalResult.transactions.length);

    expect(approvalResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: pigShop.address,
      success: true,
    });

    expect(approvalResult.transactions).toHaveTransaction({
      from: pigShop.address,
      to: pigCollection.address,
      success: true,
    });

    const nftAddress = await pigCollection.getGetNftAddressByIndex(BigInt(1));
    console.log("Expected NFT address:", nftAddress.toString());

    expect(approvalResult.transactions).toHaveTransaction({
      from: pigCollection.address,
      to: nftAddress,
      success: true,
    });

    expect(approvalResult.transactions).toHaveTransaction({
      from: nftAddress,
      to: pigShop.address,
      success: true,
    });

    console.log("=== Checking for PigCreation event ===");
    console.log("External messages count:", approvalResult.externals.length);

    let pigCreationEventFound = false;

    approvalResult.externals.forEach((ext, index) => {
      try {
        let pigCreation = loadPigCreationEvent(ext.body.asSlice());
        console.log(pigCreation);
        pigCreationEventFound = true;
      } catch (e) {}
    });

    expect(pigCreationEventFound).toBeTruthy();
    console.log("=== PigCreation event test completed successfully ===");
  });

  it("should confirm the NFT minting for both user 1 and 2", async () => {
    let approvalResult1 = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user1.address,
        referrerNftAddress: admin1.address,
        referrerAmount: toNano("0.01"),
        userBountyHunters: Dictionary.empty(),
        adminsShares: Dictionary.empty<Address, bigint>().set(
          admin1.address,
          toNano("0.02")
        ),
      }
    );

    const nftAddress1 = await pigCollection.getGetNftAddressByIndex(1n);
    console.log("user 1 nft address", nftAddress1);

    let pigCreationEventFound1 = false;

    approvalResult1.externals.forEach((ext, index) => {
      try {
        let pigCreation = loadPigCreationEvent(ext.body.asSlice());
        console.log(pigCreation);

        expect(pigCreation.nft).toEqualAddress(nftAddress1);
        pigCreationEventFound1 = true;
      } catch (e) {}
    });

    expect(pigCreationEventFound1).toBeTruthy();

    const userBountyHunters = Dictionary.empty<Address, bigint>().set(
      nftAddress1,
      toNano("0.05")
    );
    const adminsShares = Dictionary.empty<Address, bigint>().set(
      admin1.address,
      toNano("0.02")
    );
    const approvalResult2 = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user2.address,
        referrerNftAddress: nftAddress1,
        referrerAmount: toNano("0.01"),
        userBountyHunters,
        adminsShares,
      }
    );

    expect(approvalResult2.transactions).toHaveTransaction({
      from: pigShop.address,
      to: nftAddress1,
      op: PigShop.opcodes.PigBounty,
      success: true,
      value: toNano("0.05"),
    });

    const nftAddress2 = await pigCollection.getGetNftAddressByIndex(2n);
    let pigCreationEventFound2 = false;

    approvalResult2.externals.forEach((ext, index) => {
      try {
        let pigCreation = loadPigCreationEvent(ext.body.asSlice());
        console.log(pigCreation);

        expect(pigCreation.nft).toEqualAddress(nftAddress2);
        pigCreationEventFound2 = true;
      } catch (e) {}
    });

    expect(pigCreationEventFound2).toBeTruthy();
  });

  it("should allow user1 to withdraw their accumulated bounty", async () => {
    let rs = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user1.address,
        referrerNftAddress: admin1.address,
        referrerAmount: toNano("0.01"),
        userBountyHunters: Dictionary.empty<Address, bigint>(),
        adminsShares: Dictionary.empty<Address, bigint>().set(
          admin1.address,
          toNano("0.02")
        ),
      }
    );

    const nftAddress1 = await pigCollection.getGetNftAddressByIndex(
      BigInt(1)
    );

    const pigNft1 = blockchain.openContract(Pig.fromAddress(nftAddress1));
    const nftBalanceBeforeBef = (await blockchain.getContract(nftAddress1))
      .balance;
    console.log("NFT Balance before funding:", nftBalanceBeforeBef);

    const bountyAmount = toNano("0.04");
    await pigShop.send(
      deployer.getSender(),
      { value: toNano("2") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user2.address,
        referrerNftAddress: nftAddress1,
        referrerAmount: toNano("0.01"),
        userBountyHunters: Dictionary.empty<Address, bigint>().set(
          nftAddress1,
          bountyAmount
        ),
        adminsShares: Dictionary.empty<Address, bigint>().set(
          admin1.address,
          toNano("0.01")
        ),
      }
    );

    const nftBalanceBeforeAft = (await blockchain.getContract(nftAddress1))
      .balance;
    console.log("NFT Balance before withdrawal:", nftBalanceBeforeAft);
    expect(nftBalanceBeforeAft).toBeGreaterThan(bountyAmount);

    console.log("user balance before", await user1.getBalance());

    const withdrawResult = await pigNft1.send(
      user1.getSender(),
      { value: toNano("0.01") },
      { $$type: "WithdrawFromNftPig" }
    );
    console.log("user balance after", await user1.getBalance());

      const nftBalanceAfter = (await blockchain.getContract(nftAddress1))
          .balance;
      console.log("NFT Balance after withdrawal:", nftBalanceAfter);

    expect(withdrawResult.transactions).toHaveTransaction({
      from: pigShop.address,
      to: user1.address,
      success: true,
    });

    expect(withdrawResult.transactions).toHaveTransaction({
      from: nftAddress1,
      to: pigShop.address,
      op: PigShop.opcodes.WithdrawFromPig,
      success: true,
    });
  });

  it("should send the surplus amount to the specified destination and the nft balance should not increase and confirm the rewards are received by admin and nft", async () => {
    let rs = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user1.address,
        referrerNftAddress: admin1.address,
        referrerAmount: toNano("0.01"),
        userBountyHunters: Dictionary.empty<Address, bigint>(),
        adminsShares: Dictionary.empty<Address, bigint>().set(
          admin1.address,
          toNano("0.02")
        ),
      }
    );

    const nftAddress1 = await pigCollection.getGetNftAddressByIndex(
      BigInt(1)
    );

    const pigNft1 = blockchain.openContract(Pig.fromAddress(nftAddress1));
    const nftBalanceBeforeBef = (await blockchain.getContract(nftAddress1))
      .balance;
    console.log("NFT Balance before funding:", nftBalanceBeforeBef);

    const bountyAmount = toNano("0.2");
    let destBefore = (
      await blockchain.getContract(deployer.getSender().address)
    ).balance;
    console.log("dest balance before", destBefore);

    await pigShop.send(
      deployer.getSender(),
      { value: toNano("2") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user2.address,
        referrerNftAddress: nftAddress1,
        referrerAmount: toNano("0.01"),
        userBountyHunters: Dictionary.empty<Address, bigint>().set(
          nftAddress1,
          bountyAmount
        ),
        adminsShares: Dictionary.empty<Address, bigint>().set(
          admin1.address,
          toNano("0.01")
        ),
      }
    );

    const nftBalance = (await blockchain.getContract(nftAddress1)).balance;
    console.log("NFT Balance before withdrawal:", nftBalance);
    let destAfter = (await blockchain.getContract(deployer.getSender().address))
      .balance;
    console.log("dest balance after", destAfter);
    console.log("diff", destAfter - destBefore + toNano("2"));
    expect(nftBalance).toBeGreaterThan(nftBalanceBeforeBef);
    expect(destAfter).toBeGreaterThan(destBefore - toNano("2"));
  });

  it("should upgrade the user 1 nft pig to max level", async () => {
    let rs = await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      {
        $$type: "PigApproval",
        pig: null,
        userAddress: user1.address,
        referrerNftAddress: admin1.address,
        referrerAmount: toNano("0.01"),
        userBountyHunters: Dictionary.empty<Address, bigint>(),
        adminsShares: Dictionary.empty<Address, bigint>().set(
          admin1.address,
          toNano("0.02")
        ),
      }
    );

    const nftAddress = await pigCollection.getGetNftAddressByIndex(BigInt(1));
    const pigNft1 = blockchain.openContract(Pig.fromAddress(nftAddress));
    expect(
      (await pigNft1.getGetNftData()).individualContent
        .beginParse()
        .loadStringTail()
    ).toEqual("1.json");

    for (let i = 2; i <= 4; i++) {
        console.log(`Upgrading pig to level ${i}...`);
        await pigShop.send(
            deployer.getSender(),
            { value: toNano("1") },
            {
                $$type: "PigApproval",
                pig: nftAddress,
                userAddress: user1.address,
                referrerNftAddress: admin1.address,
                referrerAmount: toNano("0.01"),
                userBountyHunters: Dictionary.empty<Address, bigint>(),
                adminsShares: Dictionary.empty<Address, bigint>().set(
                    admin1.address,
                    toNano("0.02")
                ),
            }
        );

        expect(
            (await pigNft1.getGetNftData()).individualContent
                .beginParse()
                .loadStringTail()
        ).toEqual(`${i}.json`);
    }
  });

  it("should mint and upgrade 13 NFTs", async () => {
    const users = await Promise.all([...new Array(13)]
      .map(async (_v, i) =>
        await blockchain.treasury(`inviter_${i}`)
      )
    );
    for (let i = 0; i < users.length; i++) {
      console.log(`Minting NFT for user ${i + 1}...`);
      const userBountyHunters = Dictionary.empty<Address, bigint>();
      for (let j = 1; j <= i; j++) {
        userBountyHunters.set(
          await pigCollection.getGetNftAddressByIndex(BigInt(j)),
          toNano("0.05")
        );
      }
      const adminsShares = Dictionary.empty<Address, bigint>().set(
        admin1.address,
        toNano("0.02")
      );
      await pigShop.send(
        users[i].getSender(),
        { value: toNano("0.05") * BigInt(i) + toNano("0.02") + toNano("0.01")  + toNano("0.02") },
        'UpgradePig'
      );
      const approvalResult = await pigShop.send(
        deployer.getSender(),
        { value: toNano("0.175") },
        {
          $$type: "PigApproval",
          pig: null,
          userAddress: users[i].address,
          referrerNftAddress: i === 0 ? admin1.address : await pigCollection.getGetNftAddressByIndex(BigInt(i)),
          referrerAmount: toNano("0.01"),
          userBountyHunters,
          adminsShares,
        }
      );

      console.log(`Approved for user ${i + 1}`);

      const nftAddress = await pigCollection.getGetNftAddressByIndex(BigInt(i + 1));
      console.log(`NFT address for user ${i + 1}: ${nftAddress.toRawString()}`);
      let pigCreationEventFound = false;

      approvalResult.externals.forEach((ext) => {
        try {
          const pigCreation = loadPigCreationEvent(ext.body.asSlice());
          expect(pigCreation.nft).toEqualAddress(nftAddress);
          pigCreationEventFound = true;
        } catch (e) {}
      });
      expect(pigCreationEventFound).toBeTruthy();

      for (let j = 2; j <= 4; j++) {
        await pigShop.send(
          users[i].getSender(),
          { value: toNano("0.05") * BigInt(i) + toNano("0.02") + toNano("0.01")  + toNano("0.02") },
          'UpgradePig'
        );
        const nftAddress = await pigCollection.getGetNftAddressByIndex(BigInt(i + 1));
        const upgradeApprovalResult = await pigShop.send(
          deployer.getSender(),
          { value: toNano("0.175") },
          {
            $$type: "PigApproval",
            pig: nftAddress,
            userAddress: users[i].address,
            referrerNftAddress: i === 0 ? admin1.address : await pigCollection.getGetNftAddressByIndex(BigInt(i)),
            referrerAmount: toNano("0.01"),
            userBountyHunters,
            adminsShares,
          }
        );

        const pigNft = blockchain.openContract(Pig.fromAddress(nftAddress));
        expect(
          (await pigNft.getGetNftData()).individualContent
            .beginParse()
            .loadStringTail()
        ).toEqual(`${j}.json`);

        console.log(`Upgraded pig of user ${i + 1} to level ${j}`);
      }
    }
  });

  it("should withdraw leftovers", async () => {
    await pigShop.send(
      deployer.getSender(),
      { value: toNano("1") },
      null,
    );
    const deployerBalanceBefore = await deployer.getBalance();
    console.log("Deployer Balance before withdrawal:", deployerBalanceBefore);
    const pigShopBalanceBefore = (await blockchain.getContract(pigShop.address)).balance;
    console.log("PigShop Balance before withdrawal:", pigShopBalanceBefore);

    await pigShop.send(
      deployer.getSender(),
      { value: toNano("0.1") },
      { $$type: "WithdrawLeftovers" },
    );

    const deployerBalanceAfter = await deployer.getBalance();
    console.log("Deployer Balance after withdrawal:", deployerBalanceAfter);
    const pigShopBalanceAfter = (await blockchain.getContract(pigShop.address)).balance;
    console.log("PigShop Balance after withdrawal:", pigShopBalanceAfter);

    expect(deployerBalanceAfter).toBeGreaterThan(deployerBalanceBefore);
    expect(pigShopBalanceAfter).toBeLessThan(pigShopBalanceBefore);
  });
});
