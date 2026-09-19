const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Aapka Final MongoDB Connection Link
const MONGO_URI = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/wingame?retryWrites=true&w=majority";

// MongoDB Connect
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Successfully Connected!'))
    .catch(err => console.log('❌ MongoDB Connection Error:', err));

// --- 1. DATABASE SCHEMAS ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
    telegramId: String,
    type: String, // 'deposit' ya 'withdraw'
    amount: Number,
    utr: String,      // Deposit ke liye
    upiId: String,    // Withdraw ke liye
    status: { type: String, default: 'pending' }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);


// --- 2. GAME LOGIC & TIMER ---
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


// --- 3. USER GAME APIs ---
app.get('/', (req, res) => res.send("🚀 Live Game Backend is Running!"));

app.get('/game-status', (req, res) => {
    res.json({ period: currentPeriod, time: countdown, results: gameHistory });
});

app.post('/get-balance', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, balance: 1000 });
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
        let user = await User.findOne({ telegramId });
        if (!user) return res.json({ success: false, message: "User not found!" });
        if (user.balance < betAmount) return res.json({ success: false, message: "Insufficient Balance!" });

        user.balance -= betAmount;
        await user.save();
        pendingBets.push({ telegramId, betSelection, betAmount, period });

        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        res.json({ success: false, message: "Server Error" });
    }
});

// 🆕 USER DEPOSIT & WITHDRAW APIs
app.post('/deposit', async (req, res) => {
    const { telegramId, amount, utr } = req.body;
    try {
        const trx = new Transaction({ telegramId, type: 'deposit', amount, utr, status: 'pending' });
        await trx.save();
        res.json({ success: true, message: 'Deposit request sent to Admin!' });
    } catch (error) {
        res.json({ success: false, message: 'Deposit failed.' });
    }
});

app.post('/withdraw', async (req, res) => {
    const { telegramId, amount, upiId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) {
            return res.json({ success: false, message: 'Insufficient balance for withdrawal!' });
        }
        // Withdrawal request daalte hi user ka balance kat jayega. (Agar admin reject karega toh wapas add ho jayega)
        user.balance -= amount;
        await user.save();

        const trx = new Transaction({ telegramId, type: 'withdraw', amount, upiId, status: 'pending' });
        await trx.save();
        res.json({ success: true, message: 'Withdrawal request sent to Admin!' });
    } catch (error) {
        res.json({ success: false, message: 'Withdrawal failed.' });
    }
});


// --- 4. ADMIN PANEL APIs ---
app.get('/admin/pending-deposits', async (req, res) => {
    try {
        let requests = await Transaction.find({ type: 'deposit', status: 'pending' });
        let formatted = requests.map(r => ({ id: r._id, telegramId: r.telegramId, amount: r.amount, utr: r.utr }));
        res.json({ requests: formatted });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/admin/pending-withdrawals', async (req, res) => {
    try {
        let requests = await Transaction.find({ type: 'withdraw', status: 'pending' });
        let formatted = requests.map(r => ({ id: r._id, telegramId: r.telegramId, amount: r.amount, upiId: r.upiId }));
        res.json({ requests: formatted });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/admin/approve-deposit', async (req, res) => {
    const { requestId, action } = req.body;
    try {
        let trx = await Transaction.findById(requestId);
        if(!trx || trx.status !== 'pending') return res.json({ message: "Invalid request" });
        
        trx.status = action === 'approve' ? 'approved' : 'rejected';
        await trx.save();

        if (action === 'approve') {
            await User.updateOne({ telegramId: trx.telegramId }, { $inc: { balance: trx.amount } });
        }
        res.json({ message: `Deposit ${action}d successfully!` });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/admin/approve-withdraw', async (req, res) => {
    const { requestId, action } = req.body;
    try {
        let trx = await Transaction.findById(requestId);
        if(!trx || trx.status !== 'pending') return res.json({ message: "Invalid request" });
        
        trx.status = action === 'approve' ? 'approved' : 'rejected';
        await trx.save();

        if (action === 'reject') {
            // Agar Admin reject kare, toh user ko paise wapas mil jayenge
            await User.updateOne({ telegramId: trx.telegramId }, { $inc: { balance: trx.amount } });
        }
        res.json({ message: `Withdrawal ${action}d successfully!` });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});


// Server Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
