import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { Parser } from "json2csv"; // ✅ CSV export

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

// Schemas
const configSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed,
});
const Config = mongoose.model("Config", configSchema);

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

// Global competition reset
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

// Routes

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

app.post("/submit-score", async (req, res) => {
  const { telegramId, username, score } = req.body;
  if (!telegramId || typeof score !== "number" || score <= 0) {
    return res.status(400).json({ success: false });
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
  } catch {
    res.status(500).json({ success: false });
  }
});

app.post("/refer", async (req, res) => {
  const { telegramId, username, referrer } = req.body;
  if (!telegramId || !username || !referrer || telegramId === referrer) {
    return res.status(400).json({ success: false });
  }

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

app.get("/competition-status", async (req, res) => {
  const config = await Config.findOne({ key: "lastCompetitionReset" });
  const last = new Date(config?.value || new Date());
  const next = new Date(last.getTime() + 14 * 24 * 60 * 60 * 1000);

  res.json({
    lastCompetitionReset: last,
    nextResetDate: next,
    daysRemaining: Math.max(0, 14 - Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24))),
  });
});

// 🔐 Admin: See all users
app.get("/admin/players", async (req, res) => {
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const users = await Player.find();
  res.json(users);
});

app.get("/admin/all-players", async (req, res) => {
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const players = await Player.find().sort({ totalScore: -1 });
    res.json(players);
  } catch {
    res.status(500).send("Error fetching all players");
  }
});

// ✅ NEW CSV EXPORT ROUTE
app.get("/admin/export-csv", async (req, res) => {
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const players = await Player.find();

    const fields = ["telegramId", "username", "wallet", "totalScore", "competitionScore", "referredBy", "referrals"];
    const parser = new Parser({ fields });
    const csv = parser.parse(players);

    res.header("Content-Type", "text/csv");
    res.attachment("players.csv");
    return res.send(csv);
  } catch (err) {
    res.status(500).send("Error exporting CSV");
  }
});

// Default + Reset Info
app.get("/", (req, res) => res.send("TonDrop Game Backend is live ✅"));

app.get("/reset-info", (req, res) => {
  try {
    const globalStart = new Date(process.env.GLOBAL_COMPETITION_START);
    if (isNaN(globalStart)) {
      return res.status(500).json({ error: "Invalid GLOBAL_COMPETITION_START date" });
    }

    const now = new Date();
    const msInDay = 1000 * 60 * 60 * 24;
    const daysSinceStart = Math.floor((now - globalStart) / msInDay);
    const periodsPassed = Math.floor(daysSinceStart / 14);
    const lastReset = new Date(globalStart.getTime() + periodsPassed * 14 * msInDay);
    const nextReset = new Date(lastReset.getTime() + 14 * msInDay);
    const daysRemaining = Math.max(0, Math.ceil((nextReset - now) / msInDay));

    res.json({
      lastReset: lastReset.toISOString(),
      nextReset: nextReset.toISOString(),
      daysRemaining,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to calculate reset info" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
