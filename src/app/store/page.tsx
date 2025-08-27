/* eslint-disable @next/next/no-img-element */
"use client";
import { Page } from "@/components/Page";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { Button } from "@telegram-apps/telegram-ui";
import React from "react";
import { pigsMapV2 } from "@/utils/pigs_map";
import axios, { AxiosResponse, isAxiosError } from "axios";
import PigCard from "@/components/PigCard/PigCard";
import SuggestionSlider from "@/components/SuggestionSlider/SuggestionSlider";
import { logger } from "../../../logger";
import { fromNano, Sender, SenderArguments, toNano } from "@ton/ton";
import { PigShop } from "../../../wrappers/PigShop";
import { Address } from "@ton/core";
import {
  PigInfo,
  PurchasePigResponse,
  UpgradePigParams,
  WithdrawPigParams,
} from "@/models/purchase";

import { Pig } from "../../../wrappers/Pig";
import { ContractAddresses } from "../../../scripts/constants";
import { useWallet } from "@/app/context/WalletProvider";
import { useAccount } from "@/app/context/AccountProvider";
import { ClaimTokensResponse } from "@/models/claimTokens";

type PigData = {
  pig_level: number;
  buyable_pigs: number;
};

export default function StorePage() {
  const t = useTranslations("i18n");
  const { walletAddress, sender, tonClient } = useWallet();
  const { user, initDataState, refetchUserData } = useAccount();
  //const [piggyBankBalance, setPiggyBankBalance] = useState(BigInt(0));
  const [currentPigCode, setCurrentPigCode] = useState<number | undefined>();
  const [pigsData, setPigsData] = useState<PigData>();
  const [pigsInfo, setPigsInfo] = useState<PigInfo[]>();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  //const [tonPrice, setTonPrice] = useState(0);
  const [isPurchaseInProgress, setIsPurchaseInProgress] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);

  const userTelegramId = useMemo(() => initDataState?.user?.id, [initDataState]);

  const pigsMap = pigsMapV2(t);

  const handlePurchasePig = async () => {
    if (!walletAddress || !tonClient || isPurchaseInProgress) return;

    try {
      const params: AxiosResponse<PurchasePigResponse> = await axios.get(
        `/api/pigs/upgradePigParams?wallet_address=${walletAddress}`, 
        {
          timeout: 240000
        }
      );

      let pigShop = tonClient.open(
        PigShop.fromAddress(ContractAddresses.pigShop)
      );

      await pigShop.send(
        sender!,
        {
          value: BigInt((params.data.message as UpgradePigParams).amount),
        },
        (params.data.message as UpgradePigParams).operation
      );

      console.log("Transaction sent");

      alert("✅ UpgradePig transaction sent successfully!");

      console.log("Waiting for transaction to be confirmed...");

      setIsPurchaseInProgress(true);

      const response = await axios.post<PurchasePigResponse>(`/api/pigs/upgradePig`, {
        wallet_address: walletAddress,
        telegram_id: userTelegramId,
      });

      alert(
          typeof response.data.message === 'string' ? response.data : 'upgraded_pig_level' in response.data.message ?
          t('storePage.purchaseCongratulations', { pig: pigsMap.find(pig => pig.code === response.data.message.upgraded_pig_level)?.title ?? 'PIG' }) :
              t('storePage.purchaseCongratulations', { pig: pigsMap.find(pig => pig.code === ((currentPigCode ?? 0) + 1))?.title ?? 'PIG' })
      );
      // show the rest to the user
    } catch (error) {
      console.error("Transaction failed or was rejected:", error);
      logger.error("Transaction failed or was rejected:", error);
      alert(`⚠️ Transaction was cancelled or failed. ${error}`);
    }
    await fetchPigsData();

    setIsPurchaseInProgress(false);
    setIsConfirmModalOpen(false);
  };

  const handleWithdrawal = async () => {
    if (!walletAddress || !tonClient || isPurchaseInProgress) return;

    try {
      const response = (
        await axios.get(
          `/api/pigs/withdrawParams?wallet_address=${walletAddress}`
        )
      ).data as { success: false; message: string; } | { success: true; message: WithdrawPigParams; };

      let params: WithdrawPigParams;
      if (response.success) {
        params = response.message;
      } else {
        throw new Error(response.message);
      }
      
      console.log("passed the api call, params are " + JSON.stringify(params))
      console.log("parsed address " + Address.parse(params.pig_address).toString())
      console.log("parsed nft address " + String(Pig.fromAddress(Address.parse(params.pig_address))))
      console.log("passed all")
      let pig = tonClient.open(
        Pig.fromAddress(Address.parse(params.pig_address))
      );
      console.log("passed creating the nft item")
      await pig.send(
        sender!,
        {
          value: BigInt(params.amount),
        },
        { $$type: params.operation }
      );

      console.log("withdraw Request sent");

      alert(
        `✅ Withdraw request for ${params.balance.toString()} has been sent.`
      );

      console.log("Waiting for transaction to be confirmed...");

      setIsPurchaseInProgress(true);

      // show the rest to the user
    } catch (error) {
      console.error("Transaction failed or was rejected:", error);
      logger.error("Transaction failed or was rejected:", error);
      alert(`⚠️ Transaction was cancelled or failed. ${error}`);
    }
    await fetchPigsData();
    await refetchUserData();

    setIsPurchaseInProgress(false);
    setIsConfirmModalOpen(false);
  };

  const handleTokenWithdrawal = async () => {
      try {
          const response = await axios.post<ClaimTokensResponse>(`/api/pigs/claimTokens`, {
              wallet_address: walletAddress,
              telegram_id: userTelegramId,
          });

          if(!response.data.success) throw new Error(response.data.message);

          alert(`You successfully claimed ${response.data.tokens} PIG`);

          await fetchPigsData();
          await refetchUserData();
      } catch (e) {
          if(isAxiosError(e)) {
              alert(e.response?.data?.message ?? e.message);
          } else {
              console.error(e);
          }
      }
  };

  // const fetchTonPrice = async () => {
  //   const res = await axios.get(
  //     `https://api.coinpaprika.com/v1/tickers/ton-toncoin`
  //   );
  //   const tonPriceToSet = res?.data?.quotes?.USD.price.toFixed(2);
  //
  //   setTonPrice(tonPriceToSet || 0);
  // };

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

  const fetchPigsInfo = async () => {
    await axios.get(`/api/pigs/info`).then(
      response => setPigsInfo(prevData => response?.data?.pigs ?? prevData),
      (err) => console.error(err),
    );
  };

  useEffect(() => {
    fetchPigsInfo();
  }, []);

  // const fetchUserPigData = async () => {
  //   if (!walletAddress || !tonClient || !user?.pig_address) return;
  //
  //   try {
  //     const pig = tonClient.open(
  //       Pig.fromAddress(Address.parse(user.pig_address))
  //     );
  //     const pigBalance = (await pig.getTonBalance()) - toNano("0.01");
  //     setPiggyBankBalance(pigBalance > BigInt(0) ? pigBalance : BigInt(0));
  //   } catch (err) {
  //     throw new Error(`Error fetching pig balance: ${err}`);
  //   }
  // };

  useEffect(() => {
    if (walletAddress !== user?.wallet_address) return;
    fetchPigsData();
    refetchUserData();
    // fetchTonPrice();
    // fetchUserPigData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, user?.pig_address, user?.wallet_address]);

  useEffect(() => {
    if (!pigsData) return;
    setCurrentPigCode(pigsData.pig_level);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pigsData]);

  const currentPig =
    currentPigCode || currentPigCode === 0
      ? pigsMap.find((item) => item.code === currentPigCode)
      : undefined;

  const nextPig =
    currentPigCode || currentPigCode === 0
      ? pigsMap.find((item) => item.code === currentPigCode + 1)
      : undefined;

  const placeholderSlide = {
    title: undefined,
    hint: (
      <>
        <span className="yellow">{t("storePage.collectNFT")}</span>
        <strong className="yellow">{t("storePage.collectionName")}</strong>
      </>
    ),
    cover: "/imgs/pigs/placeholder.png",
    code: 0,
  };
  const slides = [
    placeholderSlide,
    ...pigsMap.map((pigData) => {
      const titleClassName = pigData.className;
      return {
        title: (
          <>
            <span className={`slide-title ${titleClassName}`}>
              {pigData.title}
            </span>
          </>
        ),
        caption: (
          <>
            <span className="normal-bold">
              {t("storePage.levelsCount", {
                count: pigData.level,
              })}
            </span>{" "}
            <span className="thick">
              (
              {t("storePage.slotsCount", {
                count: pigData.slots,
              })}
              )
            </span>
          </>
        ),
        cover: pigData.cover,
        code: pigData.code,
      };
    }),
  ];

  const filteredSlides = slides.filter(
    (slide) =>
      (currentPigCode && slide.code >= currentPigCode) || !currentPigCode
  );

  const suggestionData = {
    title:
      nextPig?.code === 1 ? t("storePage.buyThe") : t("storePage.upgradeTo"),
    description:
      nextPig?.code === 1
        ? t("storePage.startEarning")
        : t("storePage.earnMore"),
    buttonText:
      nextPig?.code === 1 ? t("storePage.purchase") : t("storePage.upgrade"),
  };

  const toggleConfirmModal = () => {
    setIsConfirmModalOpen(!isConfirmModalOpen);
  };

  const suggestionSlides = [
    {
      nextText: (
        <>
          <div className="text">
            <h2>{t("storePage.buy")}</h2>
            <h2 className="bold bronze">{t("storePage.bronzePig")}</h2>
            <h3>{t("storePage.startEarning")}</h3>
          </div>
        </>
      ),
      buttonText: t("storePage.purchase"),
      cover: "/imgs/pigs/bronze.png",
      onClick: toggleConfirmModal,
      code: 1,
    },
    {
      nextText: (
        <>
          <div className="text">
            <h2>{t("storePage.upgradeTo")}</h2>
            <h2 className="bold silver">{t("storePage.silverPig")}</h2>
            <h3>{t("storePage.earnMore")}</h3>
          </div>
        </>
      ),
      lockedText: (
        <>
          <div className="text">
            <h2 className="bold silver">{t("storePage.silverPig")}</h2>
            <h2>
              {t("storePage.buy")}{" "}
              <span className="bold bronze">{t("storePage.bronzePig")}</span>
            </h2>
            <h3 className="small">{t("storePage.toUnlock")}</h3>
          </div>
        </>
      ),
      buttonText: t("storePage.purchase"),
      cover: "/imgs/pigs/silver.png",
      onClick: toggleConfirmModal,
      isLocked: currentPigCode !== 1,
      code: 2,
    },
    {
      nextText: (
        <>
          <div className="text">
            <h2>{t("storePage.upgradeTo")}</h2>
            <h2 className="bold gold">{t("storePage.goldPig")}</h2>
            <h3>{t("storePage.earnMore")}</h3>
          </div>
        </>
      ),
      lockedText: (
        <>
          <div className="text">
            <h2 className="bold gold">{t("storePage.goldPig")}</h2>
            <h2>
              {t("storePage.buy")}{" "}
              <span className="bold silver">{t("storePage.silverPig")}</span>
            </h2>
            <h3 className="small">{t("storePage.toUnlock")}</h3>
          </div>
        </>
      ),
      buttonText: t("storePage.purchase"),
      cover: "/imgs/pigs/gold.png",
      onClick: toggleConfirmModal,
      isLocked: currentPigCode !== 2,
      code: 3,
    },
    {
      nextText: (
        <>
          <div className="text">
            <h2>{t("storePage.upgradeTo")}</h2>
            <h2 className="bold diamond">{t("storePage.diamondPig")}</h2>
            <h3>{t("storePage.earnMore")}</h3>
          </div>
        </>
      ),
      lockedText: (
        <>
          <div className="text">
            <h2 className="bold diamond">{t("storePage.diamondPig")}</h2>
            <h2>
              {t("storePage.buy")}{" "}
              <span className="bold gold">{t("storePage.goldPig")}</span>
            </h2>
            <h3 className="small">{t("storePage.toUnlock")}</h3>
          </div>
        </>
      ),
      buttonText: t("storePage.purchase"),
      cover: "/imgs/pigs/diamond.png",
      onClick: toggleConfirmModal,
      isLocked: currentPigCode !== 3,
      code: 4,
    },
  ];

  const filteredSuggestionSlides = suggestionSlides.filter(
    (slide) => slide.code > (currentPigCode || 0)
  );
  const nextPigClassName = nextPig?.className || '';
  
  const currentPigInfo = pigsInfo?.find(pig => pig.level === (currentPigCode ?? 0));

  const fullnessPercent = Number.EPSILON + (+fromNano(user?.piggy_bank_balance ?? 0) / (+fromNano(currentPigInfo?.balance_limit ?? 0) || Number.POSITIVE_INFINITY) || 0);

  useEffect(() => {
      const updateTokenBalance = () => {
          setTokenBalance(Math.min(
              currentPigInfo?.token_limit ?? 0,
              (user?.token_balance ?? 0) + (Date.now() - +new Date(user?.accrual_start ?? Date.now())) * (currentPigInfo?.tokens_per_day ?? 0) / (24*60*60*1000)
          ));
      };

      if (!tokenBalance) updateTokenBalance();

      const timeout = setTimeout(updateTokenBalance, 1000);

      return () => clearTimeout(timeout);
  }, [tokenBalance, currentPigInfo, user]);

  return (
    <>
      {isConfirmModalOpen ? (
          <div className="confirm-modal-container">
            <div className="title-container">
              <span className="yellow">{suggestionData.title} </span>{" "}
              <span className={`bold ${nextPigClassName}`}>{nextPig?.title}</span>
              <br />
              <span className="normal">{suggestionData.description}</span>{" "}
            </div>
            <div className="cover-container">
              <img
                  className="shining-image"
                  src="/imgs/common/shining.png"
                  alt="Shining"
              />
              <img className="pig-image" src={nextPig?.cover} alt="pig-cover" />
            </div>
            <div className="details-container">
              <div className="detail-item">
          <span>
            {t("storePage.numberOfLevels", { level: nextPig?.level })}
          </span>
              </div>
              <div className="detail-item">
          <span>
            {t("storePage.numberOfSlots", { slots: nextPig?.slots })}
          </span>
              </div>
              <div className="detail-item">
          <span>
            {t("storePage.tonCapacity", { capacity: fromNano(pigsInfo?.find(pig => pig.level === (currentPigCode ?? 0) + 1)?.balance_limit ?? 0) })}
          </span>
              </div>
            </div>
            <div className="action-container">
              {isPurchaseInProgress ? (
                  <div className="loader-container">
                    <div className="loader" />
                    <span>{t("storePage.transactionInProgress")}</span>
                  </div>
              ) : (
                  <div className="btns">
                    <button
                        onClick={handlePurchasePig}
                        className="action-btn purchase-btn"
                    >
                      <div>
                        <span className="price">{fromNano(pigsInfo?.find(pig => pig.level === (currentPigCode ?? 0) + 1)?.price ?? 0)}</span> TON
                      </div>
                    </button>
                    <button
                        onClick={toggleConfirmModal}
                        className="action-btn close-btn"
                    >
                      <div>{t("storePage.cancel")}</div>
                    </button>
                  </div>
              )}
            </div>
          </div>
      ) : (
        <Page>
          <div className="store-container">
            <div className="balance-container">
              <div className="balance-info">
                <img src="/imgs/icons/ton.png" alt="ton-icon" className="ton-icon" />
                <span className="text">
                  <h4 className="earning">{+parseFloat(fromNano(user?.piggy_bank_balance ?? 0)).toFixed(3)}</h4>{" "}
                  <h4 className="total">/ {fromNano(currentPigInfo?.balance_limit ?? 0)} TON</h4>
                </span>
                <Button
                    className="withdraw-btn"
                    disabled={fullnessPercent <= Number.EPSILON}
                    onClick={handleWithdrawal}
                >
                  {t("storePage.withdraw")}
                </Button>
              </div>
              <div className="token-balance-info">
                <img src="/imgs/icons/big-pig.png" alt="token-icon" className="token-icon" />
                <span className="text">
                  <h4 className="earning">{tokenBalance.toFixed(0)}</h4>{" "}
                  <h4 className="total">/ {(currentPigInfo?.token_limit ?? 0)} PIG</h4>
                </span>
                <Button
                    className="withdraw-btn"
                    disabled={tokenBalance <= 1}
                    onClick={handleTokenWithdrawal}
                >
                  {t("storePage.withdraw")}
                </Button>
              </div>
              {fullnessPercent >= 0.75 && (
                  <div className="fullness-warning">
                    <img src={
                      fullnessPercent >= 0.9999 ?
                      "/imgs/icons/error.png" :
                      "/imgs/icons/warning.png"
                    } alt="Warning" className="warning-icon" />
                    <span>
                      {
                        fullnessPercent >= 0.9999 ? !nextPig ?
                            t("storePage.capacityFullMessage") :
                            t("storePage.capacityFullUpgradeMessage") :
                          t("storePage.capacityWarningMessage")
                      }
                    </span>
                  </div>
              )}
            </div>
            <PigCard pigInfo={filteredSlides[0]} />
            <SuggestionSlider slides={filteredSuggestionSlides} isLoading={currentPigCode === undefined} />
          </div>
        </Page>
      )}
    </>
  );
}
