import { Address } from "@ton/core";

export const ContractAddresses = {
  pigToken: Address.parse(process.env.NEXT_PUBLIC_PIG_TOKEN_ADDRESS!),

  pigTokenWallet: Address.parse(process.env.NEXT_PUBLIC_PIG_TOKEN_WALLET_ADDRESS!),

  pigShop: Address.parse(process.env.NEXT_PUBLIC_PIG_SHOP_ADDRESS!),

  pigsCollection: Address.parse(process.env.NEXT_PUBLIC_PIGS_COLLECTION_ADDRESS!),
};
