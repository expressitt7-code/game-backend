
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Server ki Memory (Database lagne tak yahan data rahega)
let countdown = 60; // 1 Minute ka timer
let currentPeriod = 20260917001; // Period ID
let gameHistory = []; 

// Server par Timer chalana (Har 1 second)
setInterval(() => {
    countdown--;
    if (countdown <= 0) {
        // Naya result nikalna
        const colors = ['Red', 'Green', 'Violet'];
        const resColor = colors[Math.floor(Math.random() * colors.length)];
        const resNumber = Math.floor(Math.random() * 10); // 0-9 random number
        
        // History mein add karna
        gameHistory.unshift({
            period: currentPeriod,
            number: resNumber,
            color: resColor
        });

        // Sirf last 10 records rakhna
        if(gameHistory.length > 10) {
            gameHistory.pop();
        }

        // Agle round ki tayyari
        currentPeriod++;
        countdown = 60; // Timer reset
    }
}, 1000);

// API: Frontend ko timer aur history dena
app.get('/game-status', (req, res) => {
    res.json({
        period: currentPeriod,
        time: countdown,
        results: gameHistory
    });
});

// API: Bet receive karna
app.post('/bet', (req, res) => {
    const { telegramId, betSelection, betAmount, period } = req.body;
    
    console.log(`User ${telegramId} ne ${betSelection} par ₹${betAmount} lagaye. (Period: ${period})`);

    // Dummy logic: Balance se paise kaat kar wapas bhej raha hai
    res.json({
        success: true,
        message: `Bet successfully placed on ${betSelection}!`,
        newBalance: 1000 - betAmount // Mock balance update
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Live Game Backend running on port ${PORT}`);
});
