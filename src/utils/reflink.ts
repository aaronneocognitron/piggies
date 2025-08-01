const telegramAppBaseUrl = process.env.NEXT_PUBLIC_TELEGRAM_APP_URL!;

export const generateRefLink = (refId: string): string => {
  return `${telegramAppBaseUrl}start?startapp=register_${refId}`;
};
