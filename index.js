// index.js - TonDrop Game Backend with CSV Export and Global Competition Reset

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { Parser } from "json2csv"; // ✅ Corrected from "jason2csv"

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Config Schema (for global competition reset)
const configSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed,
});
const Config = mongoose.model("Config", configSchema);

// Player Schema
const playerSchema = new mongoose.Schema({
  telegramId: String,
  username: String,
  wallet: String,
  totalScore: { type: Number, default: 0 },
  competitionScore: { type: Number, default: 0 },
  referredBy: String,
  referrals: { type: Number, default: 0 },
});
const Player = mongoose.model("Player", playerSchema);

// Global Competition Reset Logic
async function checkAndResetCompetition() {
  let config = await Config.findOne({ key: "lastCompetitionReset" });
  const now = new Date();

  if (!config) {
    config = await Config.create({ key: "lastCompetitionReset", value: now });
    return;
  }

  const lastReset = new Date(config.value);
  const diffDays = (now - lastReset) / (1000 * 60 * 60 * 24);

  if (diffDays >= 14) {
    await Player.updateMany({}, { $set: { competitionScore: 0 } });
    config.value = now;
    await config.save();
    console.log("🏁 Global competition reset executed.");
  }
}

// Save wallet
app.post("/save-wallet", async (req, res) => {
  const { telegramId, username, wallet } = req.body;
  if (!telegramId || !wallet) return res.status(400).json({ success: false });

  try {
    await Player.findOneAndUpdate(
      { telegramId },
      { wallet, username },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// Submit score
app.post("/submit-score", async (req, res) => {
  const { telegramId, username, score } = req.body;
  if (!telegramId || typeof score !== "number" || score <= 0) {
    return res.status(400).json({ success: false, message: "Invalid input" });
  }

  try {
    await checkAndResetCompetition();
    let player = await Player.findOne({ telegramId });

    if (!player) {
      player = await Player.create({
        telegramId,
        username,
        totalScore: score,
        competitionScore: score,
      });
    } else {
      player.totalScore += score;
      player.competitionScore += score;
      player.username = username;
      await player.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error in /submit-score:", err.message);
    res.status(500).json({ success: false });
  }
});

// Referral system
app.post("/refer", async (req, res) => {
  const { telegramId, username, referrer } = req.body;
  if (!telegramId || !username || !referrer || telegramId === referrer) {
    return res.status(400).json({ success: false });
  }

  try {
    const existing = await Player.findOne({ telegramId });
    if (existing?.referredBy) {
      return res.status(400).json({ message: "Already referred" });
    }

    const inviter = await Player.findOne({ username: referrer });
    if (!inviter) return res.status(404).json({ message: "Referrer not found" });

    await Player.findOneAndUpdate(
      { telegramId },
      {
        referredBy: referrer,
        username,
        $inc: { totalScore: 500, competitionScore: 500 },
      },
      { upsert: true }
    );

    inviter.referrals += 1;
    inviter.totalScore += 1000;
    inviter.competitionScore += 1000;
    await inviter.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// Get player info
app.get("/player/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    await checkAndResetCompetition();
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ totalScore: 0 });

    const config = await Config.findOne({ key: "lastCompetitionReset" });

    res.json({
      totalScore: player.totalScore,
      competitionScore: player.competitionScore,
      username: player.username,
      lastCompetitionReset: config?.value || null,
    });
  } catch {
    res.status(500).json({ totalScore: 0 });
  }
});

// Leaderboards
app.get("/leaderboard", async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(players);
  } catch {
    res.status(500).send("Error fetching leaderboard");
  }
});

app.get("/competition-leaderboard", async (req, res) => {
  try {
    await checkAndResetCompetition();
    const players = await Player.find().sort({ competitionScore: -1 }).limit(10);
    res.json(players);
  } catch {
    res.status(500).send("Error fetching competition leaderboard");
  }
});

// Admin Players
app.get("/admin/players", async (req, res) => {
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const users = await Player.find();
  res.json(users);
});

// Admin All Players CSV Export
app.get("/admin/export-csv", async (req, res) => {
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const players = await Player.find().sort({ totalScore: -1 });
    const fields = [
      "telegramId",
      "username",
      "wallet",
      "totalScore",
      "competitionScore",
      "referredBy",
      "referrals",
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(players);
    res.header("Content-Type", "text/csv");
    res.attachment("players.csv");
    return res.send(csv);
  } catch (err) {
    console.error("CSV export failed:", err.message);
    res.status(500).send("CSV export failed");
  }
});

// Default route
app.get("/", (req, res) => {
  res.send("TonDrop Game Backend is live ✅");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
