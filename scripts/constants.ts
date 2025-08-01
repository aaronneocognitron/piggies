import { Address } from "@ton/core";

export const ContractAddresses = {
  pigShop: Address.parse(process.env.NEXT_PUBLIC_PIG_SHOP_ADDRESS!),

  pigsCollection: Address.parse(process.env.NEXT_PUBLIC_PIGS_COLLECTION_ADDRESS!),
};
