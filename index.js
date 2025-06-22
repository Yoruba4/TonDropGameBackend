import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

// MongoDB Schema
const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  subscriptionExpiresAt: Date,
});

const Player = mongoose.model("Player", playerSchema);

// Root Test Route
app.get("/", (req, res) => {
  res.send("TonDrop API is live");
});

// Save Wallet
app.post("/save-wallet", async (req, res) => {
  const { telegramId, wallet } = req.body;
  if (!telegramId || !wallet) return res.status(400).json({ success: false });

  try {
    await Player.findOneAndUpdate(
      { telegramId },
      { wallet },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// Submit Score with Boost Check
app.post("/submit-score", async (req, res) => {
  const { telegramId, score } = req.body;
  if (!telegramId || typeof score !== "number") return res.status(400).json({ success: false });

  try {
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ success: false });

    const now = new Date();
    const boostActive = player.subscriptionExpiresAt && now < new Date(player.subscriptionExpiresAt);
    const multiplier = boostActive ? 10 : 1;

    player.totalScore += score * multiplier;
    player.score = score * multiplier;
    await player.save();

    res.json({ success: true, multiplier });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// Subscribe (Boost 10x for 72hrs)
app.post("/subscribe", async (req, res) => {
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ success: false });

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  try {
    await Player.findOneAndUpdate(
      { telegramId },
      { subscriptionExpiresAt: expiresAt },
      { upsert: true }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// Get Player Total Score
app.get("/player/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ totalScore: 0 });
    res.json({ totalScore: player.totalScore || 0 });
  } catch {
    res.status(500).json({ totalScore: 0 });
  }
});

// Leaderboard Top 10
app.get("/leaderboard", async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(players);
  } catch {
    res.status(500).send("Error fetching leaderboard");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
