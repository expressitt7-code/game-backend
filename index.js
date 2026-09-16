const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Security ke liye CORS enable karna taaki aapka game is server se baat kar sake
app.use(cors());
app.use(express.json());

// Server check karne ke liye basic route
app.get('/', (req, res) => {
    res.send("🚀 Game Backend is Live and Running!");
});

// User ka score save karne ke liye API
let userScores = {};

app.post('/save-score', (req, res) => {
    const { userId, score } = req.body;
    
    if(!userId) {
        return res.status(400).json({ error: "User ID zaroori hai!" });
    }

    // Naya score save karna
    userScores[userId] = score;
    console.log(`User ${userId} ka naya score: ${score}`);
    
    res.json({ message: "Score successfully save ho gaya!", currentScore: score });
});

// User ka score dekhne ke liye API
app.get('/get-score/:userId', (req, res) => {
    const userId = req.params.userId;
    const score = userScores[userId] || 0;
    
    res.json({ userId: userId, score: score });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
