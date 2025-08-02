"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { TonApiClient } from "@ton-api/client";
import { type Sender, SenderArguments, TonClient } from "@ton/ton";
import { TonConnectUI, useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";

type WalletContextType = {
  isConnected: boolean;
  wallet: ReturnType<typeof useTonWallet>;
  walletAddress: string;
  userFriendlyWalletAddress: string;
  sender: Sender | null;
  tonApi: TonApiClient | null;
  tonClient: TonClient | null;
  tonConnectUI: TonConnectUI | null;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

type WalletContextProviderProps = {
  children: ReactNode;
};

export const WalletContextProvider = ({ children }: WalletContextProviderProps) => {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const walletAddress = useTonAddress(false);
  const userFriendlyWalletAddress = useTonAddress(true);
  const [isConnected, setIsConnected] = useState(false);
  const [sender, setSender] = useState<Sender | null>(null);
  const [tonApi, setTonApi] = useState<TonApiClient | null>(null);
  const [tonClient, setTonClient] = useState<TonClient | null>(null);

  useEffect(() => {
    if (walletAddress) {
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

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        wallet,
        walletAddress,
        userFriendlyWalletAddress,
        sender,
        tonApi,
        tonClient,
        tonConnectUI,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) throw new Error("useWallet must be used within a WalletContextProvider");
  return context;
}
