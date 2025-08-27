export type ClaimTokensRequest = {
  telegram_id: string;
  wallet_address: string;
};

export type ClaimTokensResponse = {
  success: true;
  tokens: number;
} | {
  success: false;
  errorCode?: string;
  [params: string]: any;
  message: string;
};
