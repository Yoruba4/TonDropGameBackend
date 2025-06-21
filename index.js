import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();

const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Player schema
const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  subscriptionExpiresAt: Date
});

const devWalletSchema = new mongoose.Schema({
  wallet: String
});

const Player = mongoose.model("Player", playerSchema);
const DevWallet = mongoose.model("DevWallet", devWalletSchema);

// Telegram Bot Setup
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  let player = await Player.findOne({ telegramId: chatId.toString() });

  if (!player) {
    player = await Player.create({ telegramId: chatId.toString() });
    bot.sendMessage(chatId, "Welcome to TonDrop! Your account has been created.");
  } else {
    bot.sendMessage(chatId, "Welcome back to TonDrop!");
  }
});

// Telegram message handlers
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
      const newScore = (player?.score || 0) + points;
      const newTotal = (player?.totalScore || 0) + points;
      await Player.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { score: newScore, totalScore: newTotal }
      );
      bot.sendMessage(chatId, `Your score has been updated. Total: ${newTotal}`);
    }
  }
});

// ✅ POST /score (Frontend to backend)
app.post("/score", async (req, res) => {
  const { telegramId, score } = req.body;
  if (!telegramId || typeof score !== "number") {
    return res.status(400).json({ error: "Missing telegramId or score" });
  }

  try {
    const player = await Player.findOne({ telegramId });
    if (!player) {
      await Player.create({ telegramId, totalScore: score, score });
    } else {
      player.totalScore += score;
      player.score = score;
      await player.save();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save score" });
  }
});

// ✅ GET /leaderboard
app.get("/leaderboard", async (req, res) => {
  try {
    const topPlayers = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(topPlayers);
  } catch (error) {
    res.status(500).send("Error fetching leaderboard");
  }
});

// ✅ GET /my-score/:telegramId
app.get("/my-score/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ totalScore: player.totalScore });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch score" });
  }
});

// ✅ Root route
app.get("/", (req, res) => {
  res.send("TonDrop Game Server is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
