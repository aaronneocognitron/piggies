import { Address, toNano } from "@ton/core";
import { PigCollection, Tep64TokenData } from "../wrappers/PigCollection";
import { PigShop } from "../wrappers/PigShop";
import { NetworkProvider } from "@ton/blueprint";

export const tep64TokenData: Tep64TokenData = {
  $$type: "Tep64TokenData",
  flag: BigInt("1"),
  content: "https://raw.githubusercontent.com/aaronneocognitron/piggies/refs/heads/production/public/metadata/collection.json",
};

export const itemPrefix = "https://raw.githubusercontent.com/aaronneocognitron/piggies/refs/heads/production/public/metadata/";

export async function run(provider: NetworkProvider) {
  const pigShop = provider.open(
    await PigShop.fromInit(1n, provider.sender().address!)
  );

  await pigShop.send(
    provider.sender(),
    {
      value: toNano("0.05"),
    },
    null
  );

  await provider.waitForDeploy(pigShop.address);

  console.log(
    "PigShop contract deployed successfully at:",
    pigShop.address.toRawString()
  );

  // !!! paste deployed pigshop address here
  const pigshopAddress = pigShop.address;
  const pigCollection = provider.open(
    await PigCollection.fromInit(
      provider.sender().address!,
      pigshopAddress,
      tep64TokenData,
      itemPrefix,
      {
        $$type: "RoyaltyParams",
        numerator: 0n,
        denominator: 2n,
        destination: provider.sender().address!,
      }
    )
  );

  await pigCollection.send(
    provider.sender(),
    {
      value: toNano("0.05"),
    },
    null
  );

  await provider.waitForDeploy(pigCollection.address);

  console.log(
    "PigCollection contract deployed successfully at:",
    pigCollection.address.toRawString()
  );

  const pigshop = provider.open(await PigShop.fromAddress(pigshopAddress));

  await pigshop.send(
    provider.sender(),
    {
      value: toNano("0.05"),
    },
    {
      $$type: "ChangeCollection",
      newCollection: pigCollection.address,
    }
  );
  console.log("Pigshop contract updated with collection address successfully");
}
