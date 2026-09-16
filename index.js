
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Game Data
let periodId = 100001; 
let timeLeft = 60; 
let totalBets = { Red: 0, Green: 0, Violet: 0 };
let lastWinner = "None";

// 1 Second Timer Loop
setInterval(() => {
    timeLeft--;
    
    if (timeLeft <= 0) {
        // Result Logic: Sabse kam paise wala jitega
        let winningColor = "Green"; 
        
        if (totalBets.Red <= totalBets.Green && totalBets.Red <= totalBets.Violet) {
            winningColor = "Red";
        } else if (totalBets.Green <= totalBets.Red && totalBets.Green <= totalBets.Violet) {
            winningColor = "Green";
        } else {
            winningColor = "Violet";
        }

        lastWinner = winningColor;
        console.log(`Period: ${periodId} | Winner: ${winningColor} | (Red: ${totalBets.Red}, Green: ${totalBets.Green})`);

        // Agle round ke liye Reset
        periodId++;
        timeLeft = 60;
        totalBets = { Red: 0, Green: 0, Violet: 0 };
    }
}, 1000);

// API 1: Game Status bhejna
app.get('/game-status', (req, res) => {
    res.json({
        period: periodId,
        time: timeLeft,
        lastWin: lastWinner,
        isBettingLocked: timeLeft <= 5 // 5 second lock check
    });
});

// API 2: Bet receive karna
app.post('/place-bet', (req, res) => {
    if (timeLeft <= 5) {
        return res.json({ success: false, message: "Time Up! Aakhiri 5 seconds mein bet nahi lag sakti." });
    }

    const { color, amount } = req.body;
    
    if (totalBets[color] !== undefined) {
        totalBets[color] += amount;
        res.json({ success: true, message: "Bet Accepted!" });
    } else {
        res.json({ success: false, message: "Wrong Color!" });
    }
});

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
