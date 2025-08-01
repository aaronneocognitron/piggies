"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCartShopping,
  faCheck,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { useSignal, initData } from "@telegram-apps/sdk-react";
import { Button, IconButton } from "@telegram-apps/telegram-ui";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { generateRefLink } from "@/utils/reflink";
import "./styles.css";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import Image from "next/image";
import { useAccount } from "@/app/context/AccountProvider";
import { LocaleSwitcher } from "@/components/LocaleSwitcher/LocaleSwitcher";

export default function Header() {
  const t = useTranslations("i18n");
  const { initDataState, user } = useAccount();

  const router = useRouter();
  const pathname = usePathname();

  const userData = useMemo(() => initDataState?.user, [initDataState]);

  const [isRefLinkCopied, setIsRefLinkCopied] = useState(false);
  const referralId = useMemo(() => user?.referral_id ?? '' , [user]);

  const handleCopyRefLink = () => {
    if (isRefLinkCopied || !referralId) return;

    setIsRefLinkCopied(true);
    copyToClipboard(generateRefLink(referralId));
  };

  useEffect(() => {
    if (isRefLinkCopied) {
      setTimeout(() => {
        setIsRefLinkCopied(false);
      }, 800);
    }
  }, [isRefLinkCopied]);

  const handleNavigateProfile = () => {
    if (pathname === "/profile") return;
    router.push("/profile");
  };

  const handleOpenStore = () => {
    if (pathname === "/store") return;
    router.push("/store");
  };

  return (
    <div className="main-header">
      <div className="profile-container">
        <div className="avatar-container">
          <div className="avatar">
            <FontAwesomeIcon icon={faUser} size="lg" />
          </div>
          <h4 className="full-name">
            {userData?.first_name} {userData?.last_name}
          </h4>
        </div>
        <div className="actions-container">
          <LocaleSwitcher />
          <button
              className="profile-button"
              onClick={handleNavigateProfile}
          >
            <Image
              src="/imgs/icons/settings.png"
              alt="cart-icon"
              width={28}
              height={28}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
