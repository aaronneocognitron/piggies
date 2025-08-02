"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useWallet } from "@/app/context/WalletProvider";
import { User } from "../../../SupabaseTypes";
import { initData, useSignal } from "@telegram-apps/sdk-react";

type AccountContextType = {
  user: User | null;
  refetchUserData: () => Promise<User>;
  initDataState: ReturnType<ReturnType<typeof useSignal<(typeof initData)["state"]>>>;
};

const AccountContext = createContext<AccountContextType | undefined>(undefined);

type AccountContextProviderProps = {
  children: ReactNode;
};

export const AccountContextProvider = ({ children }: AccountContextProviderProps) => {
  const { walletAddress } = useWallet();
  const initDataState = useSignal(initData.state);
  const [user, setUser] = useState<User | null>(null);
  const [isRegisterRequestSent, setIsRegisterRequestSent] = useState(false);

  const refId = useMemo(() => initDataState?.start_param?.startsWith("register_")
    ? initDataState.start_param.split("_")[1]
    : null,
    [initDataState?.start_param]
  );

  const userTelegramId = useMemo(() => initDataState?.user?.id, [initDataState?.user]);
  const userTelegramFullName = useMemo(() => String(initDataState?.user?.first_name || initDataState?.user?.last_name
    ? `${initDataState?.user?.first_name || ""} 
    ${initDataState?.user?.last_name || ""}`
    : initDataState?.user?.username || initDataState?.user?.id).replace(/\n/g, " "),
    [initDataState?.user]
  );

  useEffect(() => {
    setIsRegisterRequestSent(false);
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress && userTelegramId && !isRegisterRequestSent) {
      const handleRegister = async () => {
        try {
          const response = await axios
            .patch<{ success: true, user: User } | { success: false, message: string }>(`/api/register`, {
              wallet_address: walletAddress,
              telegram_id: userTelegramId,
              referral_id: refId || process.env.NEXT_PUBLIC_DEFAULT_REFFERAL_ID || "",
              fullname: userTelegramFullName,
            });
          if (!response.data.success) throw new Error(response.data.message);
          setUser(response.data.user);
        } catch (err: any) {
          console.error(err);
          return null;
        }
      };

      handleRegister();
      setIsRegisterRequestSent(true);
    }
  }, [userTelegramId, userTelegramFullName, refId, isRegisterRequestSent, walletAddress]);

  //TODO: don't try to register again if we are registered?

  const refetchUserData = useCallback(async () => {
    try {
      const response = await axios.get<User>(`/api/user-tree/${walletAddress}`);
      setUser(response.data);
      return response.data;
    } catch (err) {
      throw new Error(`Error fetching user data: ${err}`);
    }
  }, [walletAddress]);

  return (
    <AccountContext.Provider
      value={{
        user,
        refetchUserData,
        initDataState,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) throw new Error("useAccount must be used within a AccountContextProvider");
  return context;
}
