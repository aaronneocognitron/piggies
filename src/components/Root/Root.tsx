"use client";

import { type PropsWithChildren, useEffect, useMemo } from "react";
import {
  initData,
  useLaunchParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { AppRoot, Spinner } from "@telegram-apps/telegram-ui";

import { WalletContextProvider } from "@/app/context/WalletProvider";
import { AccountContextProvider } from "@/app/context/AccountProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorPage } from "@/components/ErrorPage";
import { useTelegramMock } from "@/hooks/useTelegramMock";
import { useDidMount } from "@/hooks/useDidMount";
import { useClientOnce } from "@/hooks/useClientOnce";
import { setLocale } from "@/core/i18n/locale";
import { init } from "@/core/init";

import "./styles.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WalletGuard } from "@/components/WalletGuard";

const isDev =
  // false;
  process.env.NEXT_PUBLIC_NODE_ENV === "development";

function RootInner({ children }: PropsWithChildren) {
  const router = useRouter();
  const query = useSearchParams();
  const lp = useLaunchParams(true);

  const startApp = useMemo(() => query?.get("startapp"), [query]);

  useEffect(() => {
    if (startApp) {
      router.push(startApp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startApp]);

  const debug = useMemo(() => isDev || lp.startParam === "debug", [lp]);

  // Initialize the library.
  useClientOnce(() => {
    init(debug);
  });

  const initDataUser = useSignal(initData.user);

  // Set the user locale.
  useEffect(() => {
    initDataUser && setLocale(initDataUser.language_code);
  }, [initDataUser]);

  return (
    <AppRoot className={"main-content"}>
      <TonConnectUIProvider manifestUrl="https://raw.githubusercontent.com/aaronneocognitron/piggies/refs/heads/production/public/tonconnect-manifest.json">
        <WalletContextProvider>
          <AccountContextProvider>
            <WalletGuard>
              {children}
            </WalletGuard>
          </AccountContextProvider>
        </WalletContextProvider>
      </TonConnectUIProvider>
    </AppRoot>
  );
}

export function Root(props: PropsWithChildren) {
  const pathname = usePathname();
  // Mock Telegram environment in development mode if needed.
  useTelegramMock(isDev || pathname === '/admin');

  const didMount = useDidMount();

  return didMount ? (
    <ErrorBoundary fallback={ErrorPage}>
      <RootInner {...props} />
    </ErrorBoundary>
  ) : (
    <div className="root__loading">
      <AppRoot>
        <Spinner size="l" />
      </AppRoot>
    </div>
  );
}
