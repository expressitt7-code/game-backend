const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection Link
const MONGO_URI = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/wingame?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Successfully Connected!'))
    .catch(err => console.log('❌ MongoDB Connection Error:', err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

let countdown = 60;
let currentPeriod = 20260917001;
let gameHistory = [];
let pendingBets = []; 

setInterval(async () => {
    countdown--;
    if (countdown <= 0) {
        const colors = ['Red', 'Green', 'Violet'];
        const resColor = colors[Math.floor(Math.random() * colors.length)];
        const resNumber = Math.floor(Math.random() * 10);
        
        gameHistory.unshift({ period: currentPeriod, number: resNumber, color: resColor });
        if(gameHistory.length > 10) gameHistory.pop();

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
                    await User.updateOne({ telegramId: bet.telegramId }, { $inc: { balance: winAmount } });
                }
            }
        }
        pendingBets = pendingBets.filter(b => b.period !== currentPeriod);

        currentPeriod++;
        countdown = 60;
    }
}, 1000);

app.get('/game-status', (req, res) => {
    res.json({ period: currentPeriod, time: countdown, results: gameHistory });
});

app.post('/get-balance', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const safeId = String(telegramId); // ID ko String me convert kar diya safety ke liye
        let user = await User.findOne({ telegramId: safeId });
        if (!user) {
            user = new User({ telegramId: safeId, balance: 1000 });
            await user.save();
        }
        res.json({ success: true, balance: user.balance });
    } catch (error) {
        res.json({ success: false, message: "DB Error" });
    }
});

app.post('/bet', async (req, res) => {
    const { telegramId, betSelection, betAmount, period } = req.body;
    
    try {
        const safeId = String(telegramId); 
        let user = await User.findOne({ telegramId: safeId });
        
        // 🛠 FIX: Agar user nahi mila, toh error dene ki bajaye turant naya account banayega
        if (!user) {
            user = new User({ telegramId: safeId, balance: 1000 });
            await user.save();
        }
        
        if (user.balance < betAmount) {
            return res.json({ success: false, message: "Insufficient Balance!" });
        }

        user.balance -= betAmount;
        await user.save();

        pendingBets.push({ telegramId: safeId, betSelection, betAmount, period });
        console.log(`User ${safeId} ne ${betSelection} par ₹${betAmount} lagaye.`);

        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        res.json({ success: false, message: "Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live Game Backend running on port ${PORT}`));
