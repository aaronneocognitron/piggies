import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { Address, SenderArguments, TonClient, type Sender } from "@ton/ton";
import { TonApiClient } from "@ton-api/client";
import { TonConnectUI, useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";

function useWalletConnection() {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();

  const [isConnected, setIsConnected] = useState(false);
  const [sender, setSender] = useState<Sender | null>(null);
  const [tonApi, setTonApi] = useState<TonApiClient | null>(null);
  const [tonClient, setTonClient] = useState<TonClient | null>(null);

  useEffect(() => {
    if (walletAddress !== "") {
      setIsConnected(true);

      const sender_ = {
        send: async (args: SenderArguments) => {
          console.log("args", args, args.to.toString());
          await tonConnectUI!.sendTransaction({
            messages: [
              {
                address: args.to.toString(),
                amount: args.value.toString(),
                payload: args.body?.toBoc()?.toString("base64"),
              },
            ],
            validUntil: Date.now() + 3 * 60 * 1000, // 3 minutes for user to approve
          });
        },
        address: walletAddress,
      } as unknown as Sender;
      setSender(sender_);

      const tonClient = new TonClient({
        endpoint: `https://${process.env.NEXT_PUBLIC_TESTNET === "true" ? "testnet." : ""}toncenter.com/api/v2/jsonRPC`,
        apiKey: process.env.NEXT_PUBLIC_TESTNET === "true" ? process.env.NEXT_PUBLIC_TESTNET_TON_CENTER_API_KEY! : process.env.NEXT_PUBLIC_MAINNET_TON_CENTER_API_KEY!,
      });
      setTonClient(tonClient);

      const tonApi = new TonApiClient({
        apiKey: process.env.NEXT_PUBLIC_TONAPI_API_KEY!,
      });
      setTonApi(tonApi);
    } else {
      setIsConnected(false);
      setSender(null);
      setTonApi(null);
      setTonClient(null);
    }
  }, [walletAddress, tonConnectUI]);

  return {
    isConnected,
    sender,
    tonApi,
    tonClient,
    walletAddress,
    tonConnectUI
  };
}


interface WalletContextType {
  isConnected: boolean;
  isAdmin: boolean;
  sender: Sender | null;
  tonApi: TonApiClient | null;
  tonClient: TonClient | null;
  walletAddress: string;
  jettonMasterAddress: Address;
  jettonMasterAddress_old: Address;
  nftCollectionAddress: Address;
  nftCollectionAddress_old: Address;
  omGiverAddress: Address;
  omGiverAddress_old: Address;
  adminAddress: Address;
  tonConnectUI: TonConnectUI | null;
  exchangerAddress: Address;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const { isConnected, sender, tonApi, tonClient, walletAddress, tonConnectUI } = useWalletConnection();
  // const walletAddress = "UQDbVOolAt-f_P9HBMjT6cih2V2n_A3BI1oedjS6QqohVw9I"
  const jettonMasterAddress = Address.parse(
    process.env.NEXT_PUBLIC_JETTON_MASTER_ADDRESS!
  );
  const jettonMasterAddress_old = Address.parse(
    process.env.NEXT_PUBLIC_JETTON_MASTER_ADDRESS_OLD!
  );
  const nftCollectionAddress = Address.parse(
    process.env.NEXT_PUBLIC_NFT_COLLECTION_ADDRESS!
  );
  const nftCollectionAddress_old = Address.parse(
    process.env.NEXT_PUBLIC_NFT_COLLECTION_ADDRESS_OLD!
  );
  const omGiverAddress = Address.parse(process.env.NEXT_PUBLIC_OMGIVER_ADDRESS!);
  const omGiverAddress_old = Address.parse(process.env.NEXT_PUBLIC_OMGIVER_ADDRESS_OLD!);
  const adminAddress = Address.parse(process.env.NEXT_PUBLIC_ADMIN_ADDRESS!);
  // Check if the connected wallet is the admin
  const isAdmin = isConnected && walletAddress === adminAddress.toString({ bounceable: false });
  const exchangerAddress = Address.parse(process.env.NEXT_PUBLIC_EXCHANGER_ADDRESS!);
  return (
    <WalletContext.Provider
      value={{
        isConnected,
        isAdmin,
        sender,
        tonApi,
        tonClient,
        walletAddress,
        jettonMasterAddress,
        jettonMasterAddress_old,
        nftCollectionAddress,
        nftCollectionAddress_old,
        omGiverAddress,
        omGiverAddress_old,
        adminAddress,
        tonConnectUI,
        exchangerAddress
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletContextProvider");
  }
  return context;
} 