#!/usr/bin/env ts-node

import TelegramBot from 'node-telegram-bot-api';

async function setupTelegramWebhook() {
  const botToken = process.env.TELEGRAM_BOT_API_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

  if (!botToken) {
    console.error('❌ Error: TELEGRAM_BOT_API_TOKEN environment variable is not set');
    process.exit(1);
  }

  if (!webhookUrl) {
    console.error('❌ Error: TELEGRAM_WEBHOOK_URL environment variable is not set');
    process.exit(1);
  }

  const bot = new TelegramBot(botToken, { polling: false });

  try {
    console.log('🚀 Setting up Telegram webhook...');

    const result = await bot.setWebHook(webhookUrl, {
      allowed_updates: ['message'],
    });

    if (result) {
      console.log('✅ Webhook set successfully!');
      console.log(`📡 Webhook URL: ${webhookUrl}`);
    } else {
      console.error('❌ Failed to set webhook');
      process.exit(1);
    }

    console.log('\n📋 Webhook Information:');
    const webhookInfo = await bot.getWebHookInfo();

    console.log(`🔗 URL: ${webhookInfo.url}`);
    console.log(`📨 Pending updates: ${webhookInfo.pending_update_count}`);
    console.log(`🔒 Max connections: ${webhookInfo.max_connections}`);
    console.log(`📝 Allowed updates: ${webhookInfo.allowed_updates?.join(', ') || 'All'}`);

    if (webhookInfo.last_error_date) {
      console.log(`⚠️  Last error: ${webhookInfo.last_error_message} (${new Date(webhookInfo.last_error_date * 1000)})`);
    } else {
      console.log('✅ No recent errors');
    }

    console.log('\n🤖 Bot Information:');
    const botInfo = await bot.getMe();
    console.log(`👤 Username: @${botInfo.username}`);
    console.log(`📛 Name: ${botInfo.first_name}`);
    console.log(`🆔 ID: ${botInfo.id}`);

    console.log('\n🎉 Setup complete! Your bot is ready to receive messages.');
    console.log(`💬 Start a chat with @${botInfo.username} on Telegram`);

  } catch (error) {
    console.error('❌ Error setting up webhook:', error);
    process.exit(1);
  }
}

setupTelegramWebhook().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
