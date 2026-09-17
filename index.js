const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Aapka Final MongoDB Connection Link (with Username & Password)
const MONGO_URI = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/wingame?retryWrites=true&w=majority&appName=Cluster0";

// MongoDB se connect karna
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Successfully Connected!'))
    .catch(err => console.log('❌ MongoDB Connection Error:', err));

// User ka Schema (Database ka structure)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 } // Naye user ko 1000 coin milenge
});
const User = mongoose.model('User', UserSchema);

// Server ki Memory
let countdown = 60;
let currentPeriod = 20260917001;
let gameHistory = [];
let pendingBets = []; 

// Game ka Timer aur Server-side Win/Loss Logic
setInterval(async () => {
    countdown--;
    if (countdown <= 0) {
        // Result Generate karna
        const colors = ['Red', 'Green', 'Violet'];
        const resColor = colors[Math.floor(Math.random() * colors.length)];
        const resNumber = Math.floor(Math.random() * 10);
        
        gameHistory.unshift({ period: currentPeriod, number: resNumber, color: resColor });
        if(gameHistory.length > 10) gameHistory.pop();

        // 🏆 WINNING LOGIC (Database mein paise add karna)
        for (let bet of pendingBets) {
            if (bet.period === currentPeriod) {
                let won = false;
                let multiplier = 0;
                
                if (bet.betSelection === resColor) { won = true; multiplier = 2; }
                let bs = resNumber > 4 ? "Big" : "Small";
                if (bet.betSelection === bs) { won = true; multiplier = 2; }
                if (bet.betSelection === resNumber.toString()) { won = true; multiplier = 9; }

                if (won) {
                    let winAmount = bet.betAmount * multiplier;
                    // Jeete huye user ka balance database mein badhana
                    await User.updateOne({ telegramId: bet.telegramId }, { $inc: { balance: winAmount } });
                }
            }
        }
        // Purani bets delete karna (naye round ke liye)
        pendingBets = pendingBets.filter(b => b.period !== currentPeriod);

        currentPeriod++;
        countdown = 60;
    }
}, 1000);

// API: Game ka Status lena
app.get('/game-status', (req, res) => {
    res.json({ period: currentPeriod, time: countdown, results: gameHistory });
});

// API: User ka Balance check karna
app.post('/get-balance', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, balance: 1000 }); // Naya Account Banega
            await user.save();
        }
        res.json({ success: true, balance: user.balance });
    } catch (error) {
        res.json({ success: false, message: "DB Error" });
    }
});

// API: Bet Lagana
app.post('/bet', async (req, res) => {
    const { telegramId, betSelection, betAmount, period } = req.body;
    
    try {
        let user = await User.findOne({ telegramId });
        if (!user) return res.json({ success: false, message: "User not found!" });
        
        if (user.balance < betAmount) {
            return res.json({ success: false, message: "Insufficient Balance!" });
        }

        // Database se paise kaatna
        user.balance -= betAmount;
        await user.save();

        // Server ki line mein bet laga dena (taaki timer khatam hone par check ho)
        pendingBets.push({ telegramId, betSelection, betAmount, period });

        console.log(`User ${telegramId} ne ${betSelection} par ₹${betAmount} lagaye.`);

        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        res.json({ success: false, message: "Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live Game Backend running on port ${PORT}`));
