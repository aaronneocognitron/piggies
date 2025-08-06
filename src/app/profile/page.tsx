/* eslint-disable @next/next/no-img-element */
"use client";
import { Page } from "@/components/Page";
import { useTranslations } from "next-intl";
import "./styles.css";
import {
  faCheck,
  faCopy,
  faSignOut,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Accordion, Button, IconButton } from "@telegram-apps/telegram-ui";
import { useEffect, useState } from "react";
import axios, { AxiosResponse } from "axios";
import { AccordionContent } from "@telegram-apps/telegram-ui/dist/components/Blocks/Accordion/components/AccordionContent/AccordionContent";
import { AccordionSummary } from "@telegram-apps/telegram-ui/dist/components/Blocks/Accordion/components/AccordionSummary/AccordionSummary";
import { pigsMap, pigsMapV2 } from "@/utils/pigs_map";
import { useSignal, initData } from "@telegram-apps/sdk-react";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { generateRefLink } from "@/utils/reflink";
import Image from "next/image";
import { useWallet } from "@/app/context/WalletProvider";

type PigData = {
  pig_level: number;
  buyable_pigs: number;
};

export default function ProfilePage() {
  const t = useTranslations("i18n");
  const { tonConnectUI, userFriendlyWalletAddress } = useWallet();

  const [isDisconnectConfirmVisible, setIsDisconnectConfirmVisible] =
    useState(false);

  useEffect(() => {
    if (isDisconnectConfirmVisible) {
      setTimeout(() => {
        setIsDisconnectConfirmVisible(false);
      }, 1300);
    }
  }, [isDisconnectConfirmVisible]);

  const handleDisconnectWallet = () => {
    tonConnectUI?.disconnect();
  };

  const truncate = (str: string, maxLength: number) => {
    const first4Part = str.slice(0, 4);
    const last4Part = str.slice(-4);
    return first4Part + "..." + last4Part;
  };

  const handleCopyAddress = () => {
    copyToClipboard(userFriendlyWalletAddress);
  };

  return (
    <Page>
      <div className="profile-container">
        <div className="wallet-address-container">
          <h3 className="title">{t("profilePage.connectedWallet")}</h3>
          <div className="wallet-address">
            <div></div>
            <h3 className="address">{truncate(userFriendlyWalletAddress, 25)}</h3>
            <button className="copy-btn">
              <img
                src="/imgs/icons/copy.png"
                alt="copy-icon"
                onClick={handleCopyAddress}
              />
            </button>
          </div>
          <Button
            className="disconnect-btn"
            before={
              // <FontAwesomeIcon icon={faSignOut} />
              <Image
                src="/imgs/icons/ton-blue.png"
                width={28}
                height={28}
                alt="ton"
              />
            }
            mode="filled"
            onClick={handleDisconnectWallet}
          >
            {t("disconnectWallet")}
          </Button>
        </div>
        <span className="version-field">
          v3.3.5-tst
        </span>
      </div>
    </Page>
  );
}
