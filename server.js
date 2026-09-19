const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 🌟 MONGODB CONNECTION 🌟
const DB_URL = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/?appName=Cluster0";
mongoose.connect(DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("✅ Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Error: ", err));

const userSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    uniqueId: { type: String, required: true },
    mainBalance: { type: Number, default: 0.00 },
    bonusBalance: { type: Number, default: 0.00 },
    depositBalance: { type: Number, default: 0.00 },
    deposits: [{ id: String, amount: Number, utr: String, date: String, status: String }],
    withdrawals: [{ id: String, amount: Number, upiId: String, date: String, status: String }],
    gameHistory: [{ period: Number, selection: String, amount: Number, status: String }]
});
const User = mongoose.model('User', userSchema);

// ==========================================
// 🌟 1. AUTHENTICATION & USERS APIs 🌟
// ==========================================
app.post('/register', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        if (await User.findOne({ mobile })) return res.json({ success: false, message: "Mobile number already registered!" });
        const uniqueId = "UID" + Math.floor(1000000 + Math.random() * 9000000);
        await new User({ mobile, password, uniqueId }).save();
        res.json({ success: true, message: "Registration Successful!", uniqueId });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.body.mobile, password: req.body.password });
        if (user) res.json({ success: true, message: "Login Successful!" });
        else res.json({ success: false, message: "Invalid Mobile or Password!" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/get-account-data', async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.body.mobile });
        if (user) res.json({ success: true, balance: user.mainBalance, depositBalance: user.depositBalance, bonusBalance: user.bonusBalance, uniqueId: user.uniqueId });
        else res.json({ success: false, message: "User not found" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/deposit-request', async (req, res) => {
    try {
        await User.updateOne({ mobile: req.body.mobile }, { $push: { deposits: { id: "DEP" + Date.now(), amount: req.body.amount, utr: req.body.utr, date: new Date().toLocaleString(), status: 'pending' } } });
        res.json({ success: true, message: "Deposit request submitted. Awaiting Admin Approval." });
    } catch (err) { res.json({ success: false, message: "Error" }); }
});

app.post('/withdraw-request', async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.body.mobile });
        if(user.mainBalance < req.body.amount) return res.json({ success: false, message: "Insufficient Balance!" });
        if(req.body.amount < 500) return res.json({ success: false, message: "Minimum withdrawal is ₹500" });
        
        user.mainBalance -= req.body.amount;
        user.withdrawals.push({ id: "WID" + Date.now(), amount: req.body.amount, upiId: req.body.upiId, date: new Date().toLocaleString(), status: 'pending' });
        await user.save();
        res.json({ success: true, message: "Withdrawal request submitted." });
    } catch (err) { res.json({ success: false, message: "Error" }); }
});

// ==========================================
// 🌟 2. GAME BETTING LOGIC 🌟
// ==========================================
let currentPeriodBets = []; // Live bets store karne ke liye

app.post('/bet', async (req, res) => {
    try {
        const { mobile, betSelection, betAmount, period } = req.body;
        const user = await User.findOne({ mobile });
        
        if (!user || user.mainBalance < betAmount) {
            return res.json({ success: false, message: "Insufficient Balance!" });
        }

        user.mainBalance -= betAmount;
        user.gameHistory.push({ period, selection: betSelection, amount: betAmount, status: 'Pending' });
        await user.save();

        // Admin dashboard ke liye live bet save karna
        currentPeriodBets.push({ selection: betSelection, amount: betAmount });

        res.json({ success: true, balance: user.mainBalance, message: "Bet Placed!" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

// ==========================================
// 🌟 3. ADMIN PANEL APIs 🌟
// ==========================================
app.get('/admin/users', async (req, res) => {
    const users = await User.find({}, { password: 0 }).sort({ _id: -1 });
    res.json({ success: true, users });
});
app.get('/admin/pending-deposits', async (req, res) => {
    const users = await User.find({ "deposits.status": "pending" });
    let requests = [];
    users.forEach(u => u.deposits.filter(d => d.status === 'pending').forEach(d => requests.push({ mobile: u.mobile, ...d._doc })));
    res.json({ success: true, requests });
});
app.get('/admin/pending-withdrawals', async (req, res) => {
    const users = await User.find({ "withdrawals.status": "pending" });
    let requests = [];
    users.forEach(u => u.withdrawals.filter(w => w.status === 'pending').forEach(w => requests.push({ mobile: u.mobile, ...w._doc })));
    res.json({ success: true, requests });
});

app.post('/admin/approve-deposit', async (req, res) => {
    const user = await User.findOne({ "deposits.id": req.body.requestId });
    const deposit = user.deposits.find(d => d.id === req.body.requestId);
    if (req.body.action === 'approve') { deposit.status = 'approved'; user.mainBalance += deposit.amount; } 
    else { deposit.status = 'rejected'; }
    await user.save();
    res.json({ success: true, message: `Deposit ${req.body.action}d successfully!` });
});

app.post('/admin/approve-withdraw', async (req, res) => {
    const user = await User.findOne({ "withdrawals.id": req.body.requestId });
    const withdraw = user.withdrawals.find(w => w.id === req.body.requestId);
    if (req.body.action === 'approve') { withdraw.status = 'approved'; } 
    else { withdraw.status = 'rejected'; user.mainBalance += withdraw.amount; }
    await user.save();
    res.json({ success: true, message: `Withdrawal ${req.body.action}d!` });
});

// ==========================================
// 🌟 4. GAME LOGIC & MANUAL CONTROL 🌟
// ==========================================
let liveHistory = [
    { period: 0, number: 3, color: 'Green', size: 'Small' },
    { period: 0, number: 8, color: 'Red', size: 'Big' },
    { period: 0, number: 0, color: 'Violet', size: 'Small' }
];
let currentActivePeriod = Math.floor(Date.now() / 60000);
let adminNextResult = null;

// New Admin Set Result Route (Color, Number, Size)
app.post('/admin/set-game-result', (req, res) => {
    const { type, value } = req.body; 
    adminNextResult = { type, value };
    res.json({ success: true, message: `Next Result Fixed: ${value}` });
});

// Admin Live Data Route
app.get('/admin/live-game-data', (req, res) => {
    let betTotals = { Green: 0, Violet: 0, Red: 0, Big: 0, Small: 0, '0':0, '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0 };
    currentPeriodBets.forEach(b => {
        if(betTotals[b.selection] !== undefined) betTotals[b.selection] += b.amount;
    });
    res.json({ success: true, period: currentActivePeriod, history: liveHistory, bets: betTotals, nextForce: adminNextResult });
});

app.get('/game-status', (req, res) => {
    const now = new Date();
    const remainingTime = 60 - now.getSeconds();
    const actualPeriod = Math.floor(now.getTime() / 60000);

    if (actualPeriod > currentActivePeriod) {
        let finalNumber = 2;

        // Force Result Logic
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
            adminNextResult = null; // Clear after use
        } else {
            finalNumber = Math.floor(Math.random() * 10);
        }

        // Determine Color & Size based on final number
        let finalColor = 'Green';
        if (finalNumber === 0 || finalNumber === 5) finalColor = 'Violet';
        else if (finalNumber % 2 === 0) finalColor = 'Red';

        let finalSize = finalNumber > 4 ? 'Big' : 'Small';

        // Update history
        liveHistory.unshift({ period: currentActivePeriod, number: finalNumber, color: finalColor, size: finalSize });
        if (liveHistory.length > 10) liveHistory.pop();
        
        currentActivePeriod = actualPeriod;
        currentPeriodBets = []; // 🌟 Clear bets for new period 🌟
    }

    res.json({ period: actualPeriod, time: remainingTime, results: liveHistory });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
