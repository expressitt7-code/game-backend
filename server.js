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
// 🌟 2. ADMIN PANEL APIs 🌟
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
// 🌟 3. SERVER-SIDE GAME LOOP & LOGIC 🌟
// ==========================================
let currentActivePeriod = Math.floor(Date.now() / 60000);
let liveHistory = [];
let currentPeriodBets = [];
let adminNextResult = null;

// Initial Dummy History
let initialP = currentActivePeriod - 10;
for (let i = 0; i < 10; i++) {
    let n = Math.floor(Math.random() * 10);
    let c = (n === 0 || n === 5) ? 'Violet' : (n % 2 === 0 ? 'Red' : 'Green');
    let s = n > 4 ? 'Big' : 'Small';
    liveHistory.unshift({ period: initialP + i, number: n, color: c, size: s });
}

// --- AUTO PROFIT CALCULATION LOGIC ---
function calculateWinningResult(currentBets, adminForcedResult = null) {
    // 1. Agar Admin ne panel se result Force (Fix) kiya hai, toh direct wahi pass karo
    if (adminForcedResult) {
        let finalNum = 0, finalColor = '', finalSize = '';
        
        if (adminForcedResult.type === 'number') {
            finalNum = parseInt(adminForcedResult.value);
        } else if (adminForcedResult.type === 'color') {
            if (adminForcedResult.value === 'Green') finalNum = 1;
            else if (adminForcedResult.value === 'Red') finalNum = 2;
            else if (adminForcedResult.value === 'Violet') finalNum = 0;
        } else if (adminForcedResult.type === 'size') {
            finalNum = adminForcedResult.value === 'Big' ? 6 : 2; // Default safe numbers for sizes
        }
        
        // Colors & Size Set karna
        finalSize = finalNum >= 5 ? 'Big' : 'Small';
        if (finalNum === 0 || finalNum === 5) finalColor = 'Violet'; // Fixed to display Violet properly in UI
        else if (finalNum % 2 === 0) finalColor = 'Red';
        else finalColor = 'Green';

        return { number: finalNum, color: finalColor, size: finalSize, isForced: true };
    }

    // 2. Agar Admin ne kuch set nahi kiya, toh 'Sabse Kam Paisa Dene Wala' Logic chalega
    let minPayout = Infinity;
    let bestNumber = 0;

    // System 0 se 9 tak har number check karega
    for (let i = 0; i <= 9; i++) {
        let currentPayout = 0;
        let numStr = i.toString();
        let sizeStr = i >= 5 ? 'Big' : 'Small';

        // A. Number ka 9x Payout
        if (currentBets[numStr]) currentPayout += currentBets[numStr] * 9;

        // B. Size (Big/Small) ka 2x Payout
        if (currentBets[sizeStr]) currentPayout += currentBets[sizeStr] * 2;

        // C. Color ka Payout
        if (i === 0) {
            if (currentBets['Red']) currentPayout += currentBets['Red'] * 1.5;
            if (currentBets['Violet']) currentPayout += currentBets['Violet'] * 4.5;
        } else if (i === 5) {
            if (currentBets['Green']) currentPayout += currentBets['Green'] * 1.5;
            if (currentBets['Violet']) currentPayout += currentBets['Violet'] * 4.5;
        } else if (i % 2 === 0) {
            if (currentBets['Red']) currentPayout += currentBets['Red'] * 2;
        } else {
            if (currentBets['Green']) currentPayout += currentBets['Green'] * 2;
        }

        // Jisme sabse kam payout (User kam jeete) usko bestNumber bana do
        if (currentPayout < minPayout) {
            minPayout = currentPayout;
            bestNumber = i;
        }
    }

    // Best Number ke hisaab se Color aur Size set karo
    let winColor = (bestNumber === 0 || bestNumber % 2 === 0) ? 'Red' : 'Green';
    if(bestNumber === 0 || bestNumber === 5) winColor = 'Violet'; // Fixed to display Violet properly in UI
    let winSize = bestNumber >= 5 ? 'Big' : 'Small';

    return { number: bestNumber, color: winColor, size: winSize, isForced: false };
}

// 🟢 THE MASTER GAME CLOCK (Runs every 1 second continuously) 🟢
setInterval(() => {
    const actualPeriod = Math.floor(Date.now() / 60000);
    
    // Agar 1 minute poora ho gaya, toh naya result nikalo
    if (actualPeriod > currentActivePeriod) {
        
        // 1. Calculate Total Bets Placed in this period
        let betTotals = { Green: 0, Violet: 0, Red: 0, Big: 0, Small: 0, '0':0, '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0 };
        currentPeriodBets.forEach(b => {
            if(betTotals[b.selection] !== undefined) betTotals[b.selection] += b.amount;
        });

        // 2. Pass betTotals to Auto Profit Logic
        const result = calculateWinningResult(betTotals, adminNextResult);
        adminNextResult = null; // Clear Admin force

        // 3. Add to History
        liveHistory.unshift({ period: currentActivePeriod, number: result.number, color: result.color, size: result.size });
        if (liveHistory.length > 10) liveHistory.pop(); // Sirf last 10 rakho
        
        // 4. Reset for NEW period
        currentActivePeriod = actualPeriod;
        currentPeriodBets = []; // Naye round ke bet zero kar do
    }
}, 1000);

// ==========================================
// 🌟 4. GAME & ADMIN LIVE DATA APIs 🌟
// ==========================================

// Users ke bet lagane ki API
app.post('/bet', async (req, res) => {
    try {
        const { mobile, betSelection, betAmount, period } = req.body;
        const user = await User.findOne({ mobile });
        
        if (!user || user.mainBalance < betAmount) return res.json({ success: false, message: "Insufficient Balance!" });

        user.mainBalance -= betAmount;
        user.gameHistory.push({ period, selection: betSelection, amount: betAmount, status: 'Pending' });
        await user.save();

        // Save bet in server memory for Auto-Profit Calculation & Admin live monitoring
        currentPeriodBets.push({ selection: betSelection, amount: betAmount });

        res.json({ success: true, balance: user.mainBalance, message: "Bet Placed Successfully!" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

// Admin Set Result API
app.post('/admin/set-game-result', (req, res) => {
    const { type, value } = req.body; 
    adminNextResult = { type, value };
    res.json({ success: true, message: `Fixed Next Winner: ${value}` });
});

// Admin Dashboard Live Data Fetch
app.get('/admin/live-game-data', (req, res) => {
    const remainingTime = 60 - new Date().getSeconds();
    
    let betTotals = { Green: 0, Violet: 0, Red: 0, Big: 0, Small: 0, '0':0, '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0 };
    currentPeriodBets.forEach(b => {
        if(betTotals[b.selection] !== undefined) betTotals[b.selection] += b.amount;
    });
    
    // Calculate total money pooled this round
    let totalPool = currentPeriodBets.reduce((acc, curr) => acc + curr.amount, 0);

    res.json({ 
        success: true, 
        period: currentActivePeriod, 
        time: remainingTime,
        history: liveHistory, 
        totalMoney: totalPool,
        bets: betTotals, 
        nextForce: adminNextResult 
    });
});

// User Game App Data Fetch
app.get('/game-status', (req, res) => {
    const remainingTime = 60 - new Date().getSeconds();
    res.json({ period: currentActivePeriod, time: remainingTime, results: liveHistory });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
