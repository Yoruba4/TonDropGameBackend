const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define Player schema and model (must match game.js!)
const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  subscriptionExpiresAt: Date,
});

const Player = mongoose.model("Player", playerSchema);

// Routes
app.get("/", (req, res) => {
  res.send("TonDrop Game API is live!");
});

// Get player total score
app.get("/player/:telegramId", async (req, res) => {
  try {
    const player = await Player.findOne({ telegramId: req.params.telegramId });
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ totalScore: player.totalScore });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch score" });
  }
});

// Leaderboard
app.get("/leaderboard", async (req, res) => {
  try {
    const topPlayers = await Player.find()
      .sort({ totalScore: -1 })
      .limit(10);
    res.json(topPlayers);
  } catch (error) {
    res.status(500).send("Error fetching leaderboard");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
