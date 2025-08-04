#!/usr/bin/env ts-node

import TelegramBot from 'node-telegram-bot-api';

async function removeWebhook() {
  const botToken = process.env.TELEGRAM_BOT_API_TOKEN;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_API_TOKEN is not set');
    return;
  }

  const bot = new TelegramBot(botToken, { polling: false });

  try {
    await bot.deleteWebHook();
    console.log('✅ Webhook removed successfully');
  } catch (error) {
    console.error('❌ Error removing webhook:', error);
  }
}

removeWebhook().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
