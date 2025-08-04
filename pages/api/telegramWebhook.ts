import TelegramBot from 'node-telegram-bot-api';
import { NextApiRequest, NextApiResponse } from 'next';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_API_TOKEN!, { polling: false });

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await bot.processUpdate(req.body);
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Error processing Telegram webhook:', error);
        res.status(200).json({ error: 'Internal server error' });
    }
}

bot.on('message', async (msg) => {
    const messageText = msg.text;

    console.log(`Received message from ${msg.from?.first_name}: ${messageText}`);
});

const translations = {
    en: {
        message: 'Click the button below to open the mini-app:',
        button: '🐷 Open Mini App',
    },
    ru: {
        message: 'Нажмите кнопку ниже, чтобы открыть мини-приложение:',
        button: '🐷 Открыть Mini App',
    }
} as const;

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userLocale = msg.from?.language_code || 'en';

    const translation = userLocale in translations ? translations[userLocale as keyof typeof translations] : translations.en;

    try {
        await bot.sendMessage(chatId, translation.message, {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: translation.button,
                        url: process.env.NEXT_PUBLIC_TELEGRAM_APP_URL!
                    }
                ]]
            }
        });
        console.log(`Sent mini-app button to ${msg.from?.first_name ?? 'Unknown User'} (${chatId})`);
    } catch (error) {
        console.error('Error sending mini-app button:', error);
    }
});

export { bot };
