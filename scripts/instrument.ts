import * as Sentry from "@sentry/node";

// Ensure to call this before importing any other modules!
Sentry.init({
    dsn: "https://0464df0cc0850bf50a1286c7f60561af@o4509742017150976.ingest.de.sentry.io/4509742018461776",

    // Adds request headers and IP for users, for more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#sendDefaultPii
    sendDefaultPii: true,

    enableLogs: true,

    integrations: [
        // send console.log, console.error, and console.warn calls as logs to Sentry
        Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
    ],
});
