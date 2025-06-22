import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import * as XLSX from "xlsx";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch((err) => console.error("MongoDB error:", err));

// Schema and Model
const playerSchema = new mongoose.Schema({
  telegramId: String,
  wallet: String,
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
});

const Player = mongoose.model("Player", playerSchema);

// 🟢 Home
app.get("/", (req, res) => {
  res.send("TonDrop API is live");
});

// 🟢 Save Wallet
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

// 🟢 Submit Score
app.post("/submit-score", async (req, res) => {
  const { telegramId, score } = req.body;
  if (!telegramId || typeof score !== "number") {
    return res.status(400).json({ success: false });
  }

  try {
    const player = await Player.findOne({ telegramId });
    if (!player) {
      await Player.create({ telegramId, score, totalScore: score });
    } else {
      player.totalScore += score;
      player.score = score;
      await player.save();
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// 🟢 Get Individual Player Total Score
app.get("/player/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ totalScore: 0 });
    res.json({ totalScore: player.totalScore });
  } catch {
    res.status(500).json({ totalScore: 0 });
  }
});

// 🟢 Leaderboard
app.get("/leaderboard", async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(players);
  } catch {
    res.status(500).send("Error fetching leaderboard");
  }
});

// 🛡️ Admin middleware
function isAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key === process.env.ADMIN_SECRET) {
    next();
  } else {
    res.status(403).json({ error: "Forbidden" });
  }
}

// 🔐 Admin route: View all players
app.get("/admin/players", isAdmin, async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 });
    res.json(players);
  } catch {
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// 🔐 Admin route: Export all players to Excel
app.get("/admin/players/export", isAdmin, async (req, res) => {
  try {
    const players = await Player.find().sort({ totalScore: -1 });

    const rows = players.map(p => ({
      TelegramID: p.telegramId,
      Wallet: p.wallet || "",
      Score: p.score || 0,
      TotalScore: p.totalScore || 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Players");

    const filePath = "./players_export.xlsx";
    XLSX.writeFile(workbook, filePath);

    res.download(filePath, "players_export.xlsx", () => {
      fs.unlinkSync(filePath); // clean up temp file after sending
    });
  } catch {
    res.status(500).json({ error: "Failed to export players" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
