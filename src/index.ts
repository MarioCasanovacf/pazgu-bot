/**
 * pazgu-bot — WhatsApp bot for the Cortos y Largos community
 * Powered by Baileys + Anthropic SDK 🦥
 */

import "dotenv/config";
import { connectWhatsApp } from "./whatsapp.js";
import { startHealthServer } from "./api.js";

console.log("🦥 Pazgu starting...");

// Health check for Railway
const port = parseInt(process.env.PORT ?? "3000", 10);
startHealthServer(port);

// Connect to WhatsApp
connectWhatsApp().catch((err) => {
  console.error("[wa] Fatal connection error:", err);
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log("\n🤖 Shutting down...");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
