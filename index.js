const express = require('express');
const cors = require('cors');

const app = express();

// CORS ko enable karna zaroori hai taaki Telegram app connect kar sake
app.use(cors());
app.use(express.json());

// Server check karne ke liye basic route
app.get('/', (req, res) => {
    res.send("Game Backend is Running Successfully!");
});

// Bet lagane ka (POST) route
app.post('/bet', (req, res) => {
    const { telegramId, betColor, betAmount } = req.body;
    
    console.log(`User ${telegramId} ne ${betColor} par ${betAmount} 🪙 lagaye.`);

    // Game ko wapas success message bhejna
    res.json({
        success: true,
        message: `Aapne ${betColor} par bet laga di hai!`,
        newBalance: 900 // Abhi ke liye humne dummy balance diya hai
    });
});

// Server chalu karna
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
