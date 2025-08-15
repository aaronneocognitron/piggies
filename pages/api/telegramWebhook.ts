import TelegramBot from 'node-telegram-bot-api';
import { NextApiRequest, NextApiResponse } from 'next';
import { Address } from '@ton/core';
import { getUser } from '@/utils/helpers';
import { attachUserToTree, getPigs, initTxHistory, isDuplicatePurchase } from '@/utils/purchase/dbOps';
import { BountyHuntersForPigApproval, findUsersBountyHunters } from '@/utils/purchase/bountyHunters';
import { TxId } from '@/models/history';
import { sendPigApproval } from '../../scripts/pigApproval';
import { getAdminWallet } from '@/utils/admin';
import { ContractAddresses } from '../../scripts/constants';
import { getTonCenterClient } from '@/utils/tonClients';
import { PigShop } from '../../build/PigShop/tact_PigShop';

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

const telegramBotAdminsIds = new Set((process.env.TELEGRAM_BOT_ADMINS_IDS ?? '').split(',').map(v => +v));

bot.onText(/\/mint (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const address = match?.[1];

    if (!telegramBotAdminsIds.has(chatId)) {
        await bot.sendMessage(chatId, 'Only admins can mint NFTs.');
        return;
    }

    if (!address || (!Address.isRaw(address) && !Address.isFriendly(address))) {
        await bot.sendMessage(chatId, 'Please provide a valid address.');
        return;
    }

    const parsedAddress = Address.parse(address);

    const userAddr = parsedAddress.toRawString();
    const [user, pig_data] = await Promise.all([
        getUser(userAddr),
        getPigs(userAddr),
    ]).catch(e => [null, null]);

    if (!user || !pig_data) {
        await bot.sendMessage(chatId, `Unknown user.`);
        return;
    }

    console.log("🐷 Pig data loaded:", pig_data);

    if (pig_data.old_pig_level === 0 && !pig_data.address) {
        const { id: user_id_to_attach, inviter_id, parent_id } = user;
        if (!parent_id) {
            // set the parent pig in ternary subtree with root = inviter
            const new_parent_id = await attachUserToTree(user_id_to_attach, inviter_id);
            console.log("🌳 Attached user to parent:", user_id_to_attach, '->', new_parent_id);
            user.parent_id = new_parent_id;
        }
    }

    const bh = await findUsersBountyHunters(userAddr, pig_data.new_pig_level);
    console.log("🏹 Bounty hunters fetched:", bh);

    console.log("🛠️ Upgrading Pig...");

    const isDup = await isDuplicatePurchase(
        userAddr,
        pig_data.new_pig_level
    );
    console.log("🔁 Is duplicate purchase?", isDup);

    if (!isDup) {
        console.log(
            "⁉️ UpgradePig tx initiated check for potential user tree update ..."
        );

        const tc = getTonCenterClient();
        const adminWallet = await getAdminWallet(tc);
        const pigShop = tc.open(PigShop.fromAddress(ContractAddresses.pigShop));

        const tx_id = TxId.create(userAddr, pig_data.new_pig_level);

        console.log("🚀 Sending pig approval message");
        await sendPigApproval(
            await BountyHuntersForPigApproval(bh),
            adminWallet,
            pigShop,
            pig_data.address,
            userAddr
        );

        await initTxHistory({
            tx_id,
            tx_hash: `manual-${chatId}-${msg.date}-PIG-${pig_data.new_pig_level}`,
            wallet_address: userAddr,
            request_status: "PigUpgradePending",
            upgraded_pig_level: pig_data.new_pig_level,
        });

        console.log("📜 Tx history initialized for UpgradePig");
    }

    await bot.sendMessage(chatId, `PIG approval request sent (upgrading to level ${pig_data.new_pig_level})\n User: ${user.fullname}\n Wallet address: ${parsedAddress.toString()}\nInviter ID: ${user.inviter_id}\nParent ID: ${user.parent_id}`);
});

export { bot };
