/* eslint-disable @next/next/no-img-element */
"use client";
import "./styles.css";
import React, {useEffect, useMemo, useState} from "react";
import {Reward} from "@/app/history/page";
import axios from "axios";
import {Button, Input, Spinner} from "@telegram-apps/telegram-ui";
import {Address, fromNano} from "@ton/core";
import {useTranslations} from "next-intl";
import {formatDate} from "@/utils/formatters";
import {pigsMapV2} from "@/utils/pigs_map";
import {User} from "../../../SupabaseTypes";
import {PigInfo} from "@/models/purchase";
import Image from "next/image";

export default function ProfilePage() {
  const t = useTranslations("i18n");
  const [walletAddress, setWalletAddress] = useState('');
  const [pigsInfo, setPigsInfo] = useState<PigInfo[]>();
  const [histories, setHistories] = useState<Reward[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const rawWalletAddress = useMemo(() => {
      try {
          return Address.isRaw(walletAddress) ? walletAddress : Address.parse(walletAddress).toRawString();
      } catch (e) {
          return '';
      }
  }, [walletAddress]);

  const fetchData = async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    try {
      const [userResponse, historyResponse] = await Promise.all([
          axios.get<User>(`/api/user-tree/${rawWalletAddress}`),
          axios.get<{message: Reward[]}>(`/api/history/${rawWalletAddress}`),
      ]);

      setUser(userResponse?.data || null);

      const historiesToSet = historyResponse?.data.message || [];
      setHistories(historiesToSet);
    } catch (e) {
      console.error(e);
      setUser(null);
      setHistories([]);
    } finally {
      setIsLoading(false);
    }
  };

  const pigsMap = pigsMapV2(t);

  const findPig = (code: number) => {
      return pigsMap.find((item) => item.code === code);
  };

    useEffect(() => {
        axios.get(`/api/pigs/info`).then(
            response => setPigsInfo(prevData => response?.data?.pigs ?? prevData),
            (err) => console.error(err),
        );
    }, []);

  return (
      <div className="admin-container">
          <form className="input-form" onSubmit={() => console.log('SUBMIT')}>
              <Input
                  className="wallet-input"
                  type="text"
                  placeholder="Enter wallet address"
                  disabled={isLoading}
                  onChange={input => setWalletAddress(input.target.value)}
              />
              <Button className="fetch-button" disabled={isLoading} onClick={fetchData}>
                  Find
              </Button>
          </form>
          {isLoading ? (
              <div className="loader">
                  <Spinner size="l" />
                  <h2>
                      {t("adminPage.loading")}
                  </h2>
              </div>
          ) : (
              <div className="user-info-container">
                  <div className="balance-container">
                      <div className="balance-info">
                          <Image
                              width={64}
                              height={64}
                              src={(user?.current_pig ? findPig(user.current_pig)?.cover : undefined) ?? '/imgs/pigs/placeholder.png'}
                              alt={"Pig image"}
                              className="pig-image"
                              draggable={false}
                          />
                          <span className="text">
                              <h4 className="earning">{+parseFloat(fromNano(user?.piggy_bank_balance ?? 0)).toFixed(3)}</h4>{" "}
                              {!!user?.user_type && (
                                  <h4 className="total">/ {fromNano(pigsInfo?.find(pig => pig.level === (user?.current_pig ?? 0))?.balance_limit ?? 0)} TON</h4>
                              )}
                          </span>
                          <strong className="text">
                              {user?.fullname ?? 'Username'}
                          </strong>
                          {!!user && !user.user_type && (
                              <span className="text">
                              ({t('adminPage.admin')})
                          </span>
                          )}
                      </div>
                  </div>
                  <div className="history-container">
                      {histories.length > 0 ?
                          histories.map((history, i) => {
                              const targetPig = findPig(history.upgraded_pig_level);
                              const pigClassName = targetPig?.className;
                              return (
                                  <div className="history-item" key={i}>
                                      <div className="details">
                                          <div className="head">
                                              <h2>
                                                  {history.fullname}{" "}
                                                  {(!history.self_balance_change || history.self_balance_change < 0) && (
                                                      <span className="level">
                                                          (
                                                          {history.referral_depth
                                                              ? t("historiesPage.level", {
                                                                  level: history.referral_depth,
                                                              })
                                                              : t("adminPage.user")}
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
                                                          <span
                                                              className={`balance ${history.self_balance_change < 0 ? 'withdraw' : ''}`}>
                                                              {history.self_balance_change > 0 && '+'}{fromNano(history.self_balance_change)} TON
                                                          </span>
                                                      </>
                                                  )) || <></>}
                                              </h2>
                                          </div>
                                      </div>
                                      <div className="cover">
                                          <img src={targetPig?.cover} alt="pig-cover"/>
                                      </div>
                                  </div>
                              );
                          }) : (
                              <div className="empty-state-container">
                                  <span className="empty-text">
                                      <h2>{t("historiesPage.noHistories")}</h2>
                                  </span>
                              </div>
                          )
                      }
                  </div>
              </div>
          )}
      </div>
  );
}
