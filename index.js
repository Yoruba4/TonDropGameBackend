// Basic index.js for TonDrop backend (stable version) import express from "express"; import mongoose from "mongoose"; import cors from "cors"; import dotenv from "dotenv";

dotenv.config();

const app = express(); app.use(cors()); app.use(express.json());

// MongoDB Connection mongoose .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, }) .then(() => console.log("✅ MongoDB connected")) .catch((err) => console.error("❌ MongoDB connection failed:", err));

const playerSchema = new mongoose.Schema({ telegramId: String, username: String, wallet: String, totalScore: { type: Number, default: 0 }, });

const Player = mongoose.model("Player", playerSchema);

app.post("/save-wallet", async (req, res) => { const { telegramId, username, wallet } = req.body; if (!telegramId || !wallet) return res.status(400).json({ success: false });

try { await Player.findOneAndUpdate( { telegramId }, { username, wallet }, { upsert: true } ); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); } });

app.post("/submit-score", async (req, res) => { const { telegramId, username, score } = req.body; if (!telegramId || typeof score !== "number" || score <= 0) return res.status(400).json({ success: false });

try { const player = await Player.findOne({ telegramId }); if (!player) { await Player.create({ telegramId, username, totalScore: score }); } else { player.totalScore += score; player.username = username; await player.save(); } res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); } });

app.get("/leaderboard", async (req, res) => { try { const players = await Player.find() .sort({ totalScore: -1 }) .limit(10); res.json(players); } catch (err) { res.status(500).send("Error fetching leaderboard"); } });

app.get("/player/:telegramId", async (req, res) => { try { const player = await Player.findOne({ telegramId: req.params.telegramId }); if (!player) return res.status(404).json({ totalScore: 0 }); res.json({ totalScore: player.totalScore, username: player.username, }); } catch { res.status(500).json({ totalScore: 0 }); } });

app.get("/", (req, res) => { res.send("✅ TonDrop Backend Running"); });

const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log(🚀 Server running on port ${PORT}));


