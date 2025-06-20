const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const botToken = process.env.BOT_TOKEN || "8111913029:AAEjdSF64sqrPrucVQIaL3c26q7-o3d4ssc";
const telegramAPI = `https://api.telegram.org/bot${botToken}`;

// Models
const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  boosterExpiry: Date,
});
const Player = mongoose.model("Player", playerSchema);

// Send message to user
async function sendMessage(chatId, text) {
  await axios.post(`${telegramAPI}/sendMessage`, {
    chat_id: chatId,
    text,
  });
}

// Webhook handler
app.post("/webhook", async (req, res) => {
  const msg = req.body.message;
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const text = msg.text?.trim();

  if (text === "/start") {
    const existing = await Player.findOne({ telegramId });
    if (!existing) await Player.create({ telegramId });
    await sendMessage(chatId, "🎮 Welcome to TonDrop! Tap the button in the game UI to start scoring.\n\nUse /wallet to save your TON wallet.");
  } else if (text?.startsWith("/wallet")) {
    const parts = text.split(" ");
    if (parts.length === 2) {
      const wallet = parts[1];
      await Player.updateOne({ telegramId }, { wallet }, { upsert: true });
      await sendMessage(chatId, "✅ Wallet saved!");
    } else {
      await sendMessage(chatId, "❗ Usage: /wallet YOUR_TON_ADDRESS");
    }
  } else if (text === "/score") {
    const player = await Player.findOne({ telegramId });
    await sendMessage(chatId, `🏆 Your total score is: ${player?.score || 0}`);
  } else {
    await sendMessage(chatId, "🤖 Unknown command. Use /start, /wallet, or /score.");
  }

  res.sendStatus(200);
});

// Public route
app.get("/", (req, res) => {
  res.send("TonDrop backend is live!");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
