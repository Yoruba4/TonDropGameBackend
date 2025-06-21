const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Server is running on Render!');
});
// Return total score for a specific player
app.get("/my-score/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const player = await Player.findOne({ telegramId });
    if (!player) return res.status(404).json({ error: "Player not found" });

    res.json({ totalScore: player.totalScore });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch score" });
  }
});// Leaderboard route
app.get("/leaderboard", async (req, res) => {
  try {
    const topPlayers = await Player.find().sort({ totalScore: -1 }).limit(10);
    res.json(topPlayers);
  } catch (error) {
    res.status(500).send("Error fetching leaderboard");
  }
});
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
