import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  subscriptionExpiresAt: Date,
});

const Player = mongoose.model("Player", playerSchema);

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

// Submit Score
app.post("/submit-score", async (req, res) => {
  const { telegramId, score } = req.body;
  if (!telegramId || typeof score !== "number") return res.status(400).json({ success: false });

  try {
    const player = await Player.findOne({ telegramId });
    if (!player) {
      await Player.create({
        telegramId,
        score,
        totalScore: score,
      });
    } else {
      player.score = score;
      player.totalScore += score;
      await player.save();
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// Get Player Score + Subscription
app.get("/player/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const player = await Player.findOne({ telegramId });
    if (!player)
      return res.status(404).json({ totalScore: 0, subscriptionActive: false });

    const subscriptionActive =
      player.subscriptionExpiresAt &&
      new Date(player.subscriptionExpiresAt) > new Date();

    res.json({
      totalScore: player.totalScore,
      subscriptionActive,
    });
  } catch {
    res.status(500).json({ totalScore: 0, subscriptionActive: false });
  }
});

// Leaderboard
app.get("/leaderboard", async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(players);
  } catch {
    res.status(500).send("Error fetching leaderboard");
  }
});

// Boost Route (called by bot on /boost)
app.post("/boost", async (req, res) => {
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ success: false });

  try {
    await Player.findOneAndUpdate(
      { telegramId },
      {
        subscriptionExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      { upsert: true }
    );
    res.json({ success: true, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) });
  } catch {
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
