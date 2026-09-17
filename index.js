const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection Link
const MONGO_URI = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/ColorGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch(err => console.log("DB Connection Error:", err));

// Database Schema (User ka Wallet)
const UserSchema = new mongoose.Schema({
    tgId: String,
    balance: { type: Number, default: 1000 } // Naye user ko ₹1000 bonus milega
});
const User = mongoose.model('User', UserSchema);

// Game Variables
let timer = 60;
let currentPeriod = new Date().getTime();
let history = [];
let currentBets = []; // Is period mein lagi hui bets

// Game Timer & Result Logic
setInterval(async () => {
    timer--;
    if (timer <= 0) {
        // Result generate karein
        const colors = ['Red', 'Green', 'Violet'];
        const resultColor = colors[Math.floor(Math.random() * colors.length)];
        const resultNumber = Math.floor(Math.random() * 10);

        // Jeetne walon ko paise dein
        for (let bet of currentBets) {
            if (bet.color === resultColor) {
                let winAmount = bet.amount * 2; // Double paise
                await User.findOneAndUpdate({ tgId: bet.tgId }, { $inc: { balance: winAmount } });
            }
        }

        // History save karein aur naya game shuru karein
        history.unshift({ period: currentPeriod, color: resultColor, number: resultNumber });
        if (history.length > 10) history.pop();

        currentPeriod = new Date().getTime();
        timer = 60;
        currentBets = []; 
    }
}, 1000);

// API: User login & get balance
app.post('/api/user', async (req, res) => {
    const { tgId } = req.body;
    if (!tgId) return res.status(400).json({ error: "Missing Telegram ID" });
    
    let user = await User.findOne({ tgId });
    if (!user) {
        user = new User({ tgId, balance: 1000 });
        await user.save();
    }
    res.json({ balance: user.balance });
});

// API: Game status
app.get('/game-status', (req, res) => {
    res.json({ period: currentPeriod, time: timer, results: history });
});

// API: Bet lagana
app.post('/place-bet', async (req, res) => {
    const { tgId, amount, selection } = req.body;
    
    let user = await User.findOne({ tgId });
    if (!user || user.balance < amount) {
        return res.status(400).json({ error: "Insufficient Balance!" });
    }

    user.balance -= amount; // Balance kaato
    await user.save();

    currentBets.push({ tgId, amount, color: selection }); // Bet record karo
    res.json({ success: true, newBalance: user.balance });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
