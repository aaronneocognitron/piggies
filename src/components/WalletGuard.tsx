"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Button,
  Modal,
  Placeholder,
  Spinner,
} from "@telegram-apps/telegram-ui";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import axios, { AxiosError, AxiosResponse } from "axios";
import { ModalHeader } from "@telegram-apps/telegram-ui/dist/components/Overlays/Modal/components/ModalHeader/ModalHeader";
import { useTranslations } from "next-intl";
import { useWallet } from "@/app/context/WalletProvider";
import { useAccount } from "@/app/context/AccountProvider";

export function WalletGuard({ children }: { children: React.ReactNode }) {
  const t = useTranslations("i18n");
  const { wallet, tonConnectUI } = useWallet();
  const { initDataState, user } = useAccount();

  const router = useRouter();
  const pathname = usePathname();

  const [initialized, setInitialized] = useState(false);

  const refId = useMemo(() => initDataState?.start_param?.startsWith("register_")
      ? initDataState.start_param.split("_")[1]
      : null,
    [initDataState?.start_param]
  );

  useEffect(() => {
    if (!tonConnectUI) return;
    tonConnectUI.connectionRestored.then(() => {
      setInitialized(true);
    });
  }, [tonConnectUI]);

  useEffect(() => {
    if (!initialized || pathname === '/admin') return;

    // if (isUserRegistered) {
    //   if (pathname === "/register") {
    //     router.replace("/");
    //   }
    // } else if (refId) {
    //   if (pathname !== "/register") {
    //     router.replace("/register");
    //   }
    //   return;
    // } else {
    //   if (pathname !== "/no-ref-link") {
    //     router.replace("/no-ref-link");
    //   }
    //   return;
    // }

    const connected = !!wallet;

    if (connected) {
      if (pathname === "/wallet-connect") {
        router.replace("/");
      }
    } else {
      if (pathname !== "/wallet-connect") {
        router.replace("/wallet-connect");
      }
    }
  }, [initialized, wallet, pathname, router, user, refId]);

  if ((!initialized || !wallet) && pathname !== "/wallet-connect" && pathname !== "/admin") {
    return (
      <div className="root__loading">
        <Spinner size="l" />
      </div>
    );
  }

  return (
    <>
      {children}
      {/* <Modal
        header={<ModalHeader>{t("walletAddressChanged")}</ModalHeader>}
        open={isWalletChangedModalOpen}
      >
        <Placeholder
          description={t("walletAddressChangedDescription")}
          header={t("walletAddressChanged")}
        ></Placeholder>
        <div className="warning-action-container">
          <Button
            className="modal-button"
            mode="filled"
            onClick={() => {
              setIsWalletChangedModalOpen(false);
            }}
          >
            {t("understood")}
          </Button>
        </div>
      </Modal> */}
    </>
  );
}
