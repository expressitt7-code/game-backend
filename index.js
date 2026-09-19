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
    type: String,
    amount: Number,
    utr: String,
    upiId: String,
    status: { type: String, default: 'pending' }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const ResultSchema = new mongoose.Schema({
    period: { type: Number, required: true, unique: true },
    number: Number,
    color: String,
    size: String
});
const Result = mongoose.model('Result', ResultSchema);


// --- 2. GAME LOGIC & MASTER CLOCK ---
// Time-based period (hamesha accurate rahega)
let currentPeriod = Math.floor(Date.now() / 60000);
let countdown = 60 - new Date().getSeconds();
let gameHistory = [];
let pendingBets = [];
let adminNextResult = null; // Admin ka set kiya hua result

// Database se purani history load karna
async function loadHistory() {
    try {
        const pastResults = await Result.find().sort({ period: -1 }).limit(10);
        if (pastResults.length > 0) {
            gameHistory = pastResults;
            // Ensure next period is accurate based on time
            currentPeriod = Math.floor(Date.now() / 60000); 
        }
    } catch (err) { console.log("History load error"); }
}
loadHistory();

// 🟢 THE MASTER GAME CLOCK (Runs every 1 second)
setInterval(async () => {
    const actualPeriod = Math.floor(Date.now() / 60000);
    countdown = 60 - new Date().getSeconds();

    // Jab 1 minute cross ho jaye, toh naya result generate karo
    if (actualPeriod > currentPeriod) {
        let finalNumber;
        
        // 🌟 NAYA: Admin Forced Result Logic
        if (adminNextResult) {
            if(adminNextResult.type === 'number') {
                finalNumber = parseInt(adminNextResult.value);
            } else if (adminNextResult.type === 'color') {
                let opts = adminNextResult.value === 'Green' ? [1,3,7,9] : (adminNextResult.value === 'Red' ? [2,4,6,8] : [0,5]);
                finalNumber = opts[Math.floor(Math.random() * opts.length)];
            } else if (adminNextResult.type === 'size') {
                let opts = adminNextResult.value === 'Big' ? [5,6,7,8,9] : [0,1,2,3,4];
                finalNumber = opts[Math.floor(Math.random() * opts.length)];
            }
            adminNextResult = null; // Ek baar use hone ke baad clear kar do
        } else {
            // Random System Result
            finalNumber = Math.floor(Math.random() * 10);
        }

        // Color & Size Decide Karna
        let finalColor = (finalNumber === 0 || finalNumber === 5) ? 'Violet' : (finalNumber % 2 === 0 ? 'Red' : 'Green');
        let finalSize = finalNumber > 4 ? 'Big' : 'Small';

        // 🌟 Result DB me save karna
        try {
            const newResult = new Result({ period: currentPeriod, number: finalNumber, color: finalColor, size: finalSize });
            await newResult.save();
        } catch (err) { }

        gameHistory.unshift({ period: currentPeriod, number: finalNumber, color: finalColor, size: finalSize });
        if(gameHistory.length > 10) gameHistory.pop();

        // 🏆 WINNING LOGIC & PAYOUTS
        for (let bet of pendingBets) {
            let won = false;
            let multiplier = 0;
            
            if (bet.betSelection === finalColor) { won = true; multiplier = 2; }
            if (bet.betSelection === finalSize) { won = true; multiplier = 2; }
            if (bet.betSelection === finalNumber.toString()) { won = true; multiplier = 9; }

            if (won) {
                let winAmount = bet.betAmount * multiplier;
                await User.updateOne({ telegramId: bet.telegramId }, { $inc: { balance: winAmount } });
            }
        }
        
        // Reset For Next Round
        pendingBets = [];
        currentPeriod = actualPeriod;
    }
}, 1000);


// --- 3. USER APIs ---
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
    } catch (error) { res.json({ success: false }); }
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
    } catch (error) { res.json({ success: false }); }
});

app.post('/deposit', async (req, res) => {
    const { telegramId, amount, utr } = req.body;
    try {
        const trx = new Transaction({ telegramId, type: 'deposit', amount, utr, status: 'pending' });
        await trx.save();
        res.json({ success: true, message: 'Deposit request sent to Admin!' });
    } catch (error) { res.json({ success: false }); }
});

app.post('/withdraw', async (req, res) => {
    const { telegramId, amount, upiId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) return res.json({ success: false, message: 'Insufficient balance!' });
        
        user.balance -= amount;
        await user.save();
        const trx = new Transaction({ telegramId, type: 'withdraw', amount, upiId, status: 'pending' });
        await trx.save();
        res.json({ success: true, message: 'Withdraw request sent!' });
    } catch (error) { res.json({ success: false }); }
});


// --- 4. ADMIN PANEL APIs ---
app.get('/admin/pending-deposits', async (req, res) => {
    let requests = await Transaction.find({ type: 'deposit', status: 'pending' });
    res.json({ requests: requests.map(r => ({ id: r._id, telegramId: r.telegramId, amount: r.amount, utr: r.utr })) });
});

app.get('/admin/pending-withdrawals', async (req, res) => {
    let requests = await Transaction.find({ type: 'withdraw', status: 'pending' });
    res.json({ requests: requests.map(r => ({ id: r._id, telegramId: r.telegramId, amount: r.amount, upiId: r.upiId })) });
});

app.post('/admin/approve-deposit', async (req, res) => {
    const { requestId, action } = req.body;
    let trx = await Transaction.findById(requestId);
    if(!trx || trx.status !== 'pending') return res.json({ message: "Invalid" });
    
    trx.status = action === 'approve' ? 'approved' : 'rejected';
    await trx.save();
    if (action === 'approve') await User.updateOne({ telegramId: trx.telegramId }, { $inc: { balance: trx.amount } });
    res.json({ message: `Deposit ${action}d!` });
});

app.post('/admin/approve-withdraw', async (req, res) => {
    const { requestId, action } = req.body;
    let trx = await Transaction.findById(requestId);
    if(!trx || trx.status !== 'pending') return res.json({ message: "Invalid" });
    
    trx.status = action === 'approve' ? 'approved' : 'rejected';
    await trx.save();
    if (action === 'reject') await User.updateOne({ telegramId: trx.telegramId }, { $inc: { balance: trx.amount } });
    res.json({ message: `Withdraw ${action}d!` });
});

// 🌟 NAYA: Admin Set Next Result API
app.post('/admin/set-game-result', (req, res) => {
    const { type, value } = req.body; 
    adminNextResult = { type, value };
    res.json({ success: true, message: `Fixed Next Winner: ${value}` });
});

// 🌟 NAYA: Admin Dashboard Live Data Fetch (Kaun kitne paise laga raha hai)
app.get('/admin/live-game-data', (req, res) => {
    let betTotals = { Green: 0, Violet: 0, Red: 0, Big: 0, Small: 0, '0':0, '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0 };
    let totalMoneyPool = 0;

    pendingBets.forEach(b => {
        if(betTotals[b.betSelection] !== undefined) {
            betTotals[b.betSelection] += b.betAmount;
        }
        totalMoneyPool += b.betAmount;
    });
    
    res.json({ 
        success: true, 
        period: currentPeriod, 
        time: countdown,
        bets: betTotals, 
        totalMoney: totalMoneyPool,
        nextForce: adminNextResult 
    });
});

// Server Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
