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
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// MongoDB Schema
const playerSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  wallet: { type: String, default: "" },
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
}, { versionKey: false });

const Player = mongoose.model("Player", playerSchema);

// Home Route
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
  } catch (err) {
    console.error("❌ Error saving wallet:", err);
    res.status(500).json({ success: false });
  }
});

// Submit Score (with debug)
app.post("/submit-score", async (req, res) => {
  const { telegramId, score } = req.body;
  if (!telegramId || typeof score !== "number") return res.status(400).json({ success: false });

  try {
    let player = await Player.findOne({ telegramId });

    if (!player) {
      const newPlayer = new Player({ telegramId, score, totalScore: score });
      newPlayer.save((err, savedPlayer) => {
        if (err) {
          console.error("❌ Error saving new player:", err);
          return res.status(500).json({ success: false });
        }
        console.log("✅ New player saved:", savedPlayer);
        return res.json({ success: true });
      });
    } else {
      player.totalScore += score;
      player.score = score;
      player.save((err, savedPlayer) => {
        if (err) {
          console.error("❌ Error updating player:", err);
          return res.status(500).json({ success: false });
        }
        console.log("✅ Updated player score:", savedPlayer);
        return res.json({ success: true });
      });
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    res.status(500).json({ success: false });
  }
});

// Get Player Score
app.get("/player/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ totalScore: 0 });
    res.json({ totalScore: player.totalScore });
  } catch (err) {
    console.error("❌ Error getting score:", err);
    res.status(500).json({ totalScore: 0 });
  }
});

// Leaderboard
app.get("/leaderboard", async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(players);
  } catch (err) {
    console.error("❌ Leaderboard fetch error:", err);
    res.status(500).send("Error fetching leaderboard");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
