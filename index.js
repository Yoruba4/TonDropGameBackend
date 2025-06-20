const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Server is running on Render!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
