const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ==== Mongoose Schemas ====

const playerSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  tonWallet: String,
  totalScore: { type: Number, default: 0 },
  boosterExpiresAt: Date,
});

const devWalletSchema = new mongoose.Schema({
  tonWallet: String,
});

const Player = mongoose.model("Player", playerSchema);
const DevWallet = mongoose.model("DevWallet", devWalletSchema);

// ==== Routes ====

app.get("/", (req, res) => {
  res.send("TonDrop backend is live.");
});

// Save or update TON wallet for player
app.post("/save-wallet", async (req, res) => {
  const { telegramId, tonWallet } = req.body;
  if (!telegramId || !tonWallet) return res.status(400).json({ error: "Missing data" });

  let player = await Player.findOne({ telegramId });
  if (player) {
    player.tonWallet = tonWallet;
    await player.save();
  } else {
    player = await Player.create({ telegramId, tonWallet });
  }

  res.json({ success: true, message: "Wallet saved", player });
});

// Get total score for a player
app.get("/player/:telegramId", async (req, res) => {
  const player = await Player.findOne({ telegramId: req.params.telegramId });
  if (!player) return res.status(404).json({ error: "Player not found" });

  const boosterActive = player.boosterExpiresAt && new Date() < player.boosterExpiresAt;
  res.json({
    telegramId: player.telegramId,
    tonWallet: player.tonWallet,
    totalScore: player.totalScore,
    boosterActive,
    boosterExpiresAt: player.boosterExpiresAt,
  });
});

// Submit tap score
app.post("/tap", async (req, res) => {
  const { telegramId, score } = req.body;
  if (!telegramId || typeof score !== "number") return res.status(400).json({ error: "Invalid data" });

  const player = await Player.findOne({ telegramId });
  if (!player) return res.status(404).json({ error: "Player not found" });

  const now = new Date();
  const boosterActive = player.boosterExpiresAt && now < player.boosterExpiresAt;
  const actualScore = boosterActive ? score * 10 : score;

  player.totalScore += actualScore;
  await player.save();

  res.json({ success: true, totalScore: player.totalScore });
});

// Purchase booster (mock logic — accepts "ton:xxxxx" format)
app.post("/buy-booster", async (req, res) => {
  const { telegramId, txHash } = req.body;
  if (!telegramId || !txHash || !txHash.startsWith("ton:")) return res.status(400).json({ error: "Invalid data" });

  const player = await Player.findOne({ telegramId });
  if (!player) return res.status(404).json({ error: "Player not found" });

  const now = new Date();
  const newExpiry = player.boosterExpiresAt && now < player.boosterExpiresAt
    ? new Date(player.boosterExpiresAt)
    : now;

  newExpiry.setDate(newExpiry.getDate() + 3); // Add 3 days
  player.boosterExpiresAt = newExpiry;
  await player.save();

  res.json({ success: true, boosterExpiresAt: newExpiry });
});

// Leaderboard (top 10)
app.get("/leaderboard", async (req, res) => {
  const topPlayers = await Player.find().sort({ totalScore: -1 }).limit(10);
  res.json(topPlayers.map(p => ({
    telegramId: p.telegramId,
    totalScore: p.totalScore,
  })));
});

// Get developer TON wallet address
app.get("/dev-wallet", async (req, res) => {
  const dev = await DevWallet.findOne();
  res.json({ tonWallet: dev?.tonWallet || "Not set" });
});

// ==== Start server ====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TonDrop backend running on port ${PORT}`);
});
