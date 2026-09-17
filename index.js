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

// 1. User Schema 
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

// 2. Game History Schema
const ResultSchema = new mongoose.Schema({
    period: { type: Number, required: true, unique: true },
    number: Number,
    color: String
});
const Result = mongoose.model('Result', ResultSchema);

// 3. 🌟 NAYA: My History (User Bets) Schema
const BetSchema = new mongoose.Schema({
    telegramId: String,
    period: Number,
    selection: String,
    amount: Number,
    status: { type: String, default: 'Pending' } // Pending, Won, Lost
});
const Bet = mongoose.model('Bet', BetSchema);

let countdown = 60;
let currentPeriod = 20260917001;
let gameHistory = [];
let pendingBets = []; 

// Server start hote hi purani game history load karna
async function loadHistory() {
    try {
        const pastResults = await Result.find().sort({ period: -1 }).limit(10);
        if (pastResults.length > 0) {
            gameHistory = pastResults;
            currentPeriod = pastResults[0].period + 1; 
        }
    } catch (err) {}
}
loadHistory();

setInterval(async () => {
    countdown--;
    if (countdown <= 0) {
        const colors = ['Red', 'Green', 'Violet'];
        const resColor = colors[Math.floor(Math.random() * colors.length)];
        const resNumber = Math.floor(Math.random() * 10);
        
        try {
            const newResult = new Result({ period: currentPeriod, number: resNumber, color: resColor });
            await newResult.save();
        } catch (err) {}

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
                    // DB me status Won karna
                    await Bet.findByIdAndUpdate(bet.dbId, { status: 'Won' });
                } else {
                    // DB me status Lost karna
                    await Bet.findByIdAndUpdate(bet.dbId, { status: 'Lost' });
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
        const safeId = String(telegramId);
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

// 🌟 NAYA API: User ki My History lane ke liye
app.post('/my-history', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const bets = await Bet.find({ telegramId: String(telegramId) }).sort({ period: -1 }).limit(20);
        res.json({ success: true, history: bets });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post('/bet', async (req, res) => {
    const { telegramId, betSelection, betAmount, period } = req.body;
    try {
        const safeId = String(telegramId); 
        let user = await User.findOne({ telegramId: safeId });
        
        if (!user) {
            user = new User({ telegramId: safeId, balance: 1000 });
            await user.save();
        }
        
        if (user.balance < betAmount) {
            return res.json({ success: false, message: "Insufficient Balance!" });
        }

        user.balance -= betAmount;
        await user.save();

        // NAYA: Bet ko database me save karna
        const newBet = new Bet({ telegramId: safeId, period, selection: betSelection, amount: betAmount });
        await newBet.save();

        // Memory me id ke sath save karna taaki result aane par update ho sake
        pendingBets.push({ dbId: newBet._id, telegramId: safeId, betSelection, betAmount, period });

        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        res.json({ success: false, message: "Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live Game Backend running on port ${PORT}`));
