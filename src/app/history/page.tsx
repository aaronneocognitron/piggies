/* eslint-disable @next/next/no-img-element */
"use client";
import React from "react";
import { Page } from "@/components/Page";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import "./styles.css";
import { pigsMapV2 } from "@/utils/pigs_map";
import axios from "axios";
import { useTonWallet } from "@tonconnect/ui-react";
import { fromNano } from "@ton/core";
import { useWallet } from "@/app/context/WalletProvider";
import { formatDate } from "@/utils/formatters";

export type Reward = {
  created_at: Date;
  fullname: string;
  upgraded_pig_level: number;
  self_balance_change: number;
  referral_depth: number;
  reward_type?: string;
};
export default function HistoryPage() {
  const t = useTranslations("i18n");
  const [histories, setHistories] = useState<Reward[]>([]);
  const { walletAddress } = useWallet();

  useEffect(() => {
    const fetchRewards = async () => {
      if (!walletAddress) return;

      const response = await axios
        .get<{
          message: Reward[];
        }>(`/api/history/${walletAddress}`)
        .catch((err) => {
          return null;
        });

      const historiesToSet = response?.data.message || [];
      setHistories(historiesToSet);
    };

    fetchRewards();
  }, [walletAddress]);

  const emptyState = (
    <div className="empty-state-container">
      <img
        src="/imgs/icons/mag-glass.png"
        alt="empty-icon"
        className="mag-pic"
      />
      <span className="empty-text">
        <h2>{t("historiesPage.noHistories")}</h2>
      </span>
    </div>
  );

  const pigsMap = pigsMapV2(t);

  const findPig = (code: number) => {
    return pigsMap.find((item) => item.code === code);
  };

  return (
    <Page>
      <div className="history-container">
        {histories.length ? (
          <>
            {histories.map((history, i) => {
              const targetPig = findPig(history.upgraded_pig_level);
              const pigClassName = targetPig?.className;
              return (
                <div className="history-item" key={i}>
                  <div className="details">
                    <div className="head">
                      <h2>
                        {history.fullname}{" "}
                        {(!history.self_balance_change || history.self_balance_change < 0) && ( // TODO: fix level fetching
                          <span className="level">
                            (
                            {history.referral_depth
                              ? t("historiesPage.level", {
                                level: history.referral_depth,
                              })
                              : t("historiesPage.you")}
                            )
                          </span>
                        )}
                      </h2>
                    </div>
                    <div className="middle">
                      <h2>
                        {/* format of history.created_at in YYYY.MM.DD */}
                        <span className="date">
                          {formatDate(new Date(history.created_at))}:
                        </span>{" "}
                        <span>{
                          history.self_balance_change >= 0 ?
                            (history.reward_type ? `${history.reward_type} ${t("historiesPage.bonusForNFT")}` : t("historiesPage.got")) :
                            t("historiesPage.emptied")
                        }</span>{" "}
                        <span className={`pig-title ${pigClassName}`}>
                          {targetPig?.title}
                        </span>
                      </h2>
                    </div>
                    <div className="footer">
                      <h2>
                        {(history.self_balance_change && (
                          <>
                            {t("historiesPage.balance")}:{" "}
                            <span className={`balance ${history.self_balance_change < 0 ? 'withdraw' : ''}`}>
                              {history.self_balance_change > 0 && '+'}{fromNano(history.self_balance_change)} TON
                            </span>
                          </>
                        )) || <></>}
                      </h2>
                    </div>
                  </div>
                  <div className="cover">
                    <img src={targetPig?.cover} alt="pig-cover" />
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          emptyState
        )}
      </div>
    </Page>
  );
}
