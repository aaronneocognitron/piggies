#!/usr/bin/env ts-node

import "./instrument";
import * as Sentry from "@sentry/node";
import { listenContractsForever } from "../src/utils/purchase/listenNode";

console.log("🚀 Starting Contracts Event Listener with auto-restart");

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  Sentry.captureException(error);
  console.error('💥 Uncaught Exception:', error);
  // Don't exit, let the restart logic handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, let the restart logic handle it
});

// Auto-restart logic
async function runListenerWithRestart() {
  let restartCount = 0;
  const maxRestarts = 10; // Prevent infinite restart loops
  const restartDelay = 5000; // 5 seconds

  while (true) {
    try {
      console.log(`📡 Starting listener process (attempt ${restartCount + 1})`);
      
      await listenContractsForever();
      
      // If we get here, the listener has completed normally (shouldn't happen)
      console.log('✅ Listener completed normally');
      break;
      
    } catch (error) {
      Sentry.captureException(error);
      restartCount++;
      console.error(`💥 Listener crashed (attempt ${restartCount}):`, error);
      
      if (restartCount >= maxRestarts) {
        console.error(`🚫 Maximum restart attempts (${maxRestarts}) reached. Exiting.`);
        process.exit(1);
      }
      
      console.log(`⏳ Restarting in ${restartDelay / 1000} seconds...`);
      
      // Wait before restarting
      await new Promise(resolve => setTimeout(resolve, restartDelay));
    }
  }
}

// Start the listener with auto-restart
runListenerWithRestart().catch((error) => {
  Sentry.captureException(error);
  console.error('💥 Fatal error in listener runner:', error);
  process.exit(1);
}); 