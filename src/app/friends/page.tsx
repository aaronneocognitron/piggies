/* eslint-disable @next/next/no-img-element */
"use client";
import { Page } from "@/components/Page";
import { useTranslations } from "next-intl";
import "./styles.css";
import { useEffect, useMemo, useState } from "react";
import axios, { AxiosResponse } from "axios";
import { pigsMapV2 } from "@/utils/pigs_map";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { generateRefLink } from "@/utils/reflink";
import { useWallet } from "@/app/context/WalletProvider";
import { useAccount } from "@/app/context/AccountProvider";
import { ReferralResponse } from "@/models/userTree";

type PigData = {
  pig_level: number;
  buyable_pigs: number;
};

type DataPerLevel = Record<
  string,
  {
    totalSlots: number;
    slots: number;
    pig: number;
    bronze: number;
    silver: number;
    gold: number;
    diamond: number;
  }
>;

export type Invitee = {
  id: number;
  telegram_id: string;
  inviter_id: number;
  parent_id: number;
  wallet_address: string;
  current_pig: number;
  fullname: string;
};

export default function FriendsPage() {
  const t = useTranslations("i18n");
  const { walletAddress } = useWallet();
  const { user, inviter, initDataState } = useAccount();
  const [isCopied, setIsCopied] = useState(false);
  const [currentPigCode, setCurrentPigCode] = useState<number | undefined>();
  const [openedAccordion, setOpenedAccordion] = useState<
    "ref" | number | undefined
  >();
  const [pigsData, setPigsData] = useState<PigData>();
  const [pigsDataPerLevel, setPigsDataPerLevel] = useState<DataPerLevel>({});
  const [invitees, setInvitees] = useState<Invitee[]>([]);

  const userTelegramId = useMemo(() => initDataState?.user?.id, [initDataState]);

  const referralId = useMemo(() => user?.referral_id ?? '', [user]);

  const truncate = (str: string, maxLength: number) => {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "...";
  };

  const fetchPigsData = async () => {
    if (!walletAddress) return;

    const response = await axios
      .get(`/api/pigs/${walletAddress}`)
      .catch((err) => {
        return null;
      });
    const pigsDataToSet = response?.data || undefined;
    setPigsData(pigsDataToSet);
  };

  useEffect(() => {
    fetchPigsData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const handleFetchReferralPerLevel = async (pigCode: number) => {
    const pig = pigsMap.find((item) => item.code === pigCode);
    if (!walletAddress || !pig) return;
    const pigsDataToSet: DataPerLevel = {};

    const response: AxiosResponse<ReferralResponse> = await axios.get(
      `/api/user-tree/referrals?wallet_address=${walletAddress}&telegram_id=${userTelegramId}&referrals=${pig.level}`
    );

    const referrals = response.data;

    Object.keys(referrals).forEach((key) => {
      const referralsDepthInfo = referrals[key as unknown as keyof typeof referrals];
      const usedSlots = Object.values(referralsDepthInfo).reduce((s, v) => s + v, 0);

      pigsDataToSet[key] = {
        totalSlots: 3 ** +key,
        slots: usedSlots,
        pig: pig.code,
        bronze: referralsDepthInfo[1] || 0,
        silver: referralsDepthInfo[2] || 0,
        gold: referralsDepthInfo[3] || 0,
        diamond: referralsDepthInfo[4] || 0,
      };
    });

    setPigsDataPerLevel(pigsDataToSet);
  };

  useEffect(() => {
    if (!pigsData) return;
    setCurrentPigCode(pigsData.pig_level);
    handleFetchReferralPerLevel(pigsData.pig_level);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pigsData]);

  useEffect(() => {
    if (!walletAddress) return;

    const fetchInvitees = async () => {
      try {
        const response: AxiosResponse<Invitee[]> = await axios.get(
          `/api/user-tree/invitees?wallet_address=${walletAddress}&telegram_id=${userTelegramId}`
        );
        const referrals = response.data;
        setInvitees(referrals);
      } catch (err) {
        throw new Error(`Error fetching referrals data: ${err}`);
      }
    };
    fetchInvitees().catch(e => console.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);
  const pigsMap = pigsMapV2(t);

  const currentPig =
    currentPigCode || currentPigCode === 0
      ? pigsMap.find((item) => item.code === currentPigCode)
      : undefined;

  const nextPig =
    currentPigCode || currentPigCode === 0
      ? pigsMap.find((item) => item.code === currentPigCode + 1)
      : undefined;
  const refLink = !currentPigCode || currentPigCode === 0 ? t("friendsPage.buyPig") : isCopied ? t("friendsPage.copied") : generateRefLink(referralId);

  const handleCopyAddress = () => {
    copyToClipboard(refLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };
  const toggleRefAccordion = () => {
    setOpenedAccordion(openedAccordion === "ref" ? undefined : "ref");
  };

  const levels = currentPig?.level || 0;

  const lockedLevels = [(currentPig?.level || 0) + 1, nextPig?.level || 0];

  const toggleLevelAccordion = (level: number) => {
    setOpenedAccordion(openedAccordion === level ? undefined : level);
  };

  const EmptyState = (
    <div className="empty-container">
      <span className="empty">{t("friendsPage.invitationSomeone")}</span>
    </div>
  );

  const findPig = (code: number) => {
    return pigsMap.find((item) => item.code === code);
  };

  const RefAccordionContent = () => {
    return (
      <div className="ref-accordion-content">
        {invitees.length ? (
          <div className="invites-container">
            {invitees.map((invite, i) => {
              const targetPig = findPig(invite.current_pig);
              const pigClassName = targetPig?.className;
              return (
                <div className="invite-item" key={i}>
                  <div className="details">
                    <div className="head">
                      <h2>{invite.fullname}</h2>
                    </div>
                    <div className="footer">
                      <h5 className={pigClassName}>{targetPig?.title}</h5>
                    </div>
                  </div>
                  <div className="pig-pic">
                    <img
                      src={targetPig?.cover || "/imgs/pigs/placeholder.png"}
                      alt="pig-cover"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          EmptyState
        )}
      </div>
    );
  };

  const LevelAccordionContent = (level: number) => {
    const targetLevel = pigsDataPerLevel[level] ?? {};
    return (
      <div className="level-accordion-content">
        <h3 className="slots">
          {t("friendsPage.slots", {
            current: targetLevel.slots,
            total: targetLevel.totalSlots,
          })}
        </h3>
        <h3 className="bronze">
          {t("friendsPage.bronzePigs", { number: targetLevel.bronze })}
          <span className="your-refs">
            {/* {" "}
            ({t("friendsPage.yourRefs", { number: 1 })}) */}
          </span>
        </h3>
        <h3 className="silver">
          {t("friendsPage.silverPigs", { number: targetLevel.silver })}
          <span className="your-refs">
            {/* {" "}
            ({t("friendsPage.yourRefs", { number: 1 })}) */}
          </span>
        </h3>
        <h3 className="gold">
          {t("friendsPage.goldPigs", { number: targetLevel.gold })}
          <span className="your-refs">
            {/* {" "}
            ({t("friendsPage.yourRefs", { number: 1 })}) */}
          </span>
        </h3>
        <h3 className="diamond">
          {t("friendsPage.diamondPigs", { number: targetLevel.diamond })}
          <span className="your-refs">
            {/* {" "}
            ({t("friendsPage.yourRefs", { number: 1 })}) */}
          </span>
        </h3>
      </div>
    );
  };

  return (
    <Page>
      <div className="friends-container">
        <div className="invite-container">
            {inviter && (
                <p className="referrer-info">
                    {t("friendsPage.yourReferrer")}: {inviter.fullname}
                </p>
            )}
          <h3 className="title">{t("friendsPage.title")}</h3>
          <div className="invite-link">
            <h3 className="link">{refLink}</h3>
            {(!currentPigCode || currentPigCode === 0) && (
                <img className="pig-icon" src="/imgs/icons/bank.png" alt="PIG" />
            )}
            <button className="copy-btn" disabled={!currentPigCode || currentPigCode === 0 || isCopied}>
              <img
                src="/imgs/icons/copy.png"
                alt="copy-icon"
                onClick={handleCopyAddress}
              />
            </button>
          </div>
          <p className="hint">{t("friendsPage.hint")}</p>
        </div>
        <div className="accordion-container">
          <div onClick={toggleRefAccordion} className="accordion your-refs">
            <h2 className="title">{t("friendsPage.yourReferrals")}</h2>
            <div
              className={`arrow ${openedAccordion === "ref" ? "--open" : ""}`}
            >
              <img src="/imgs/icons/arrow-right.png" alt=">" />
            </div>
          </div>
          {openedAccordion === "ref" && <RefAccordionContent />}
          {Array.from({ length: levels }).map((_, i) => {
            const level = i + 1;
            return (
              <>
                <div
                  onClick={() => toggleLevelAccordion(level)}
                  className="accordion level"
                  key={i}
                >
                  <h2 className="title">
                    {t("friendsPage.levelReferrals", { level })}
                  </h2>
                  <div
                    className={`arrow ${openedAccordion === level ? "--open" : ""}`}
                  >
                    <img src="/imgs/icons/arrow-right.png" alt="arrow-icon" />
                  </div>
                </div>
                {openedAccordion === level && LevelAccordionContent(level)}
              </>
            );
          })}
          {!!nextPig?.level && (
            <div className="accordion level locked">
              <div className="locked-title">
                <h2 className="title ">
                  {t("friendsPage.levelReferrals", {
                    level: lockedLevels.join(" - "),
                  })}
                </h2>
                <img
                    className="locked-img"
                    src="/imgs/icons/locked.png"
                    alt="locked"
                />
              </div>
              <div className="arrow">
                <img src="/imgs/icons/arrow-right-bright.png" alt="arrow-icon" />
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
