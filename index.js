import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Telegram Bot Setup
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// MongoDB Schemas
const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  subscriptionExpiresAt: Date,
});

const devWalletSchema = new mongoose.Schema({
  wallet: String,
});

const Player = mongoose.model("Player", playerSchema);
const DevWallet = mongoose.model("DevWallet", devWalletSchema);

// Telegram Bot Logic
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  let player = await Player.findOne({ telegramId: chatId.toString() });

  if (!player) {
    player = await Player.create({ telegramId: chatId.toString() });
    bot.sendMessage(chatId, "Welcome to TonDrop! Your player account has been created.");
  } else {
    bot.sendMessage(chatId, "Welcome back to TonDrop!");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (text?.startsWith("wallet:")) {
    const wallet = text.replace("wallet:", "").trim();
    await Player.findOneAndUpdate({ telegramId: chatId.toString() }, { wallet });
    bot.sendMessage(chatId, `Your wallet (${wallet}) has been saved.`);
  }

  if (text?.startsWith("score:")) {
    const points = parseInt(text.replace("score:", "").trim(), 10);
    if (!isNaN(points)) {
      const player = await Player.findOne({ telegramId: chatId.toString() });
      const newScore = player.score + points;
      const newTotal = player.totalScore + points;
      await Player.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { score: newScore, totalScore: newTotal }
      );
      bot.sendMessage(chatId, `Your score has been updated: ${newTotal} points`);
    }
  }
});

// API Route
app.get("/", (req, res) => {
  res.send("TonDrop Game Server is running");
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
