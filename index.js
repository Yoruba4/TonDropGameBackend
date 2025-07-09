
// index.js - Full Backend for TonDrop Game with Username, Referral, Fortnightly Competition

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// Player Schema
const playerSchema = new mongoose.Schema({
  telegramId: String,
  username: String,
  wallet: String,
  totalScore: { type: Number, default: 0 },
  competitionScore: { type: Number, default: 0 },
  lastCompetitionReset: { type: Date, default: Date.now },
  referredBy: String, // username of inviter
  referrals: { type: Number, default: 0 },
});

const Player = mongoose.model("Player", playerSchema);

// Function to auto-reset competition score every 14 days
async function checkCompetitionReset(player) {
  const now = new Date();
  const last = player.lastCompetitionReset || now;
  const diff = (now - last) / (1000 * 60 * 60 * 24); // in days
  if (diff >= 14) {
    player.competitionScore = 0;
    player.lastCompetitionReset = now;
    await player.save();
  }
}

// Save Wallet
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

// Submit Score
app.post("/submit-score", async (req, res) => {
  const { telegramId, username, score } = req.body;

  if (!telegramId || typeof score !== "number" || score <= 0) {
    return res.status(400).json({ success: false, message: "Invalid input" });
  }

  try {
    let player = await Player.findOne({ telegramId });

    if (!player) {
      player = await Player.create({
        telegramId,
        username,
        totalScore: score,
        competitionScore: score,
        lastCompetitionReset: new Date(),
      });
    } else {
      await checkCompetitionReset(player);
      player.totalScore += score;
      player.competitionScore += score;
      player.username = username;
      await player.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error in /submit-score:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Referral registration
app.post("/refer", async (req, res) => {
  const { telegramId, username, referrer } = req.body;
  if (!telegramId || !username || !referrer || telegramId === referrer)
    return res.status(400).json({ success: false });

  try {
    const existing = await Player.findOne({ telegramId });
    if (existing?.referredBy) return res.status(400).json({ message: "Already referred" });

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
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ totalScore: 0 });

    await checkCompetitionReset(player);
    res.json({
      totalScore: player.totalScore,
      competitionScore: player.competitionScore,
      username: player.username,
      lastCompetitionReset: player.lastCompetitionReset,
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
    const players = await Player.find().sort({ competitionScore: -1 }).limit(10);
    res.json(players);
  } catch {
    res.status(500).send("Error fetching competition leaderboard");
  }
});

// Admin: View All Players
app.get("/admin/players", async (req, res) => {
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const users = await Player.find();
  res.json(users);
});

// Default route
app.get("/", (req, res) => {
  res.send("TonDrop Game Backend is live ✅");
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

