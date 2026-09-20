const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 🌟 MONGODB CONNECTION 🌟
const DB_URL = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/?appName=Cluster0";
mongoose.connect(DB_URL)
.then(() => console.log("✅ Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Error: ", err));

const userSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    uniqueId: { type: String, required: true },
    mainBalance: { type: Number, default: 1000.00 },
    bonusBalance: { type: Number, default: 0.00 },
    depositBalance: { type: Number, default: 0.00 },
    deposits: [{ id: String, amount: Number, utr: String, date: String, status: String }],
    withdrawals: [{ id: String, amount: Number, upiId: String, date: String, status: String }],
    gameHistory: [{ period: Number, selection: String, amount: Number, status: String }]
});
const User = mongoose.model('User', userSchema);

const ResultSchema = new mongoose.Schema({
    period: { type: Number, required: true, unique: true },
    number: Number,
    color: String,
    size: String
});
const Result = mongoose.model('Result', ResultSchema);

// ==========================================
// 🌟 1. AUTHENTICATION & USERS APIs 🌟
// ==========================================
app.post('/register', async (req, res) => {
    try {
        const { mobile, phone, password } = req.body;
        const userMobile = mobile || phone;

        if (!userMobile || !password) {
            return res.json({ success: false, message: "Mobile number and password are required!" });
        }

        const existingUser = await User.findOne({ mobile: userMobile });
        if (existingUser) {
            return res.json({ success: false, message: "Mobile number already registered!" });
        }

        const uniqueId = "UID" + Math.floor(1000000 + Math.random() * 9000000);
        const newUser = new User({ mobile: userMobile, password, uniqueId, mainBalance: 1000.00 });
        await newUser.save();

        res.json({ success: true, message: "Registration Successful!", uniqueId });
    } catch (err) { 
        console.error("Register Error:", err);
        res.json({ success: false, message: err.message || "Server Error" }); 
    }
});

app.post('/login', async (req, res) => {
    try {
        const { mobile, phone, password } = req.body;
        const userMobile = mobile || phone;

        if (!userMobile || !password) {
            return res.json({ success: false, message: "Mobile number and password are required!" });
        }

        const user = await User.findOne({ mobile: userMobile, password });
        if (user) {
            res.json({ success: true, message: "Login Successful!", uniqueId: user.uniqueId });
        } else {
            res.json({ success: false, message: "Invalid Mobile or Password!" });
        }
    } catch (err) { 
        console.error("Login Error:", err);
        res.json({ success: false, message: err.message || "Server Error" }); 
    }
});

app.post('/get-account-data', async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.body.mobile || req.body.phone });
        if (user) {
            res.json({ 
                success: true, 
                balance: user.mainBalance, 
                depositBalance: user.depositBalance, 
                bonusBalance: user.bonusBalance, 
                uniqueId: user.uniqueId,
                deposits: user.deposits,
                withdrawals: user.withdrawals,
                gameHistory: user.gameHistory
            });
        } else {
            res.json({ success: false, message: "User not found" });
        }
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/deposit-request', async (req, res) => {
    try {
        const { mobile, amount, utr } = req.body;
        await User.updateOne({ mobile }, { $push: { deposits: { id: "DEP" + Date.now(), amount, utr, date: new Date().toLocaleString(), status: 'pending' } } });
        res.json({ success: true, message: "Deposit request submitted. Awaiting Admin Approval." });
    } catch (err) { res.json({ success: false, message: "Error" }); }
});

app.post('/withdraw-request', async (req, res) => {
    try {
        const { mobile, amount, upiId } = req.body;
        const user = await User.findOne({ mobile });
        if(!user) return res.json({ success: false, message: "User not found!" });
        if(user.mainBalance < amount) return res.json({ success: false, message: "Insufficient Balance!" });
        if(amount < 500) return res.json({ success: false, message: "Minimum withdrawal is ₹500" });
        
        user.mainBalance -= amount;
        user.withdrawals.push({ id: "WID" + Date.now(), amount, upiId, date: new Date().toLocaleString(), status: 'pending' });
        await user.save();
        res.json({ success: true, message: "Withdrawal request submitted." });
    } catch (err) { res.json({ success: false, message: "Error" }); }
});

// ==========================================
// 🌟 2. ADMIN PANEL APIs 🌟
// ==========================================
app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ _id: -1 });
        res.json({ success: true, users });
    } catch(err) { res.json({ success: false, users: [] }); }
});

app.get('/admin/pending-deposits', async (req, res) => {
    try {
        const users = await User.find({ "deposits.status": "pending" });
        let requests = [];
        users.forEach(u => u.deposits.filter(d => d.status === 'pending').forEach(d => requests.push({ mobile: u.mobile, uniqueId: u.uniqueId, ...d._doc })));
        res.json({ success: true, requests });
    } catch(err) { res.json({ success: true, requests: [] }); }
});

app.get('/admin/pending-withdrawals', async (req, res) => {
    try {
        const users = await User.find({ "withdrawals.status": "pending" });
        let requests = [];
        users.forEach(u => u.withdrawals.filter(w => w.status === 'pending').forEach(w => requests.push({ mobile: u.mobile, uniqueId: u.uniqueId, ...w._doc })));
        res.json({ success: true, requests });
    } catch(err) { res.json({ success: true, requests: [] }); }
});

app.post('/admin/approve-deposit', async (req, res) => {
    try {
        const { requestId, action } = req.body;
        const user = await User.findOne({ "deposits.id": requestId });
        if(!user) return res.json({ success: false, message: "Deposit not found" });
        
        const deposit = user.deposits.find(d => d.id === requestId);
        if (action === 'approve') { 
            deposit.status = 'approved'; 
            user.mainBalance += deposit.amount; 
        } else { 
            deposit.status = 'rejected'; 
        }
        await user.save();
        res.json({ success: true, message: `Deposit ${action}d successfully!` });
    } catch(e) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/admin/approve-withdraw', async (req, res) => {
    try {
        const { requestId, action } = req.body;
        const user = await User.findOne({ "withdrawals.id": requestId });
        if(!user) return res.json({ success: false, message: "Withdrawal not found" });

        const withdraw = user.withdrawals.find(w => w.id === requestId);
        if (action === 'approve') { 
            withdraw.status = 'approved'; 
        } else { 
            withdraw.status = 'rejected'; 
            user.mainBalance += withdraw.amount; // Refund on rejection
        }
        await user.save();
        res.json({ success: true, message: `Withdrawal ${action}d!` });
    } catch(e) { res.json({ success: false, message: "Server Error" }); }
});

// ==========================================
// 🌟 3. SERVER-SIDE GAME LOOP & LOGIC 🌟
// ==========================================
let currentActivePeriod = Math.floor(Date.now() / 60000);
let liveHistory = [];
let currentPeriodBets = []; 
let adminNextResult = null;

async function loadHistory() {
    try {
        const pastResults = await Result.find().sort({ period: -1 }).limit(10);
        if (pastResults.length > 0) {
            liveHistory = pastResults.map(r => ({ period: r.period, number: r.number, color: r.color, size: r.size }));
            currentActivePeriod = Math.floor(Date.now() / 60000); 
        } else {
            let initialP = currentActivePeriod - 10;
            for (let i = 0; i < 10; i++) {
                let n = Math.floor(Math.random() * 10);
                let c = (n === 0 || n === 5) ? 'Violet' : (n % 2 === 0 ? 'Red' : 'Green');
                let s = n > 4 ? 'Big' : 'Small';
                liveHistory.unshift({ period: initialP + i, number: n, color: c, size: s });
            }
        }
    } catch (err) { console.log("History load error"); }
}
loadHistory();

function calculateWinningResult(currentBetsArray, adminForcedResult = null) {
    let currentBets = { Green: 0, Violet: 0, Red: 0, Big: 0, Small: 0, '0':0, '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0 };
    currentBetsArray.forEach(b => {
        if(currentBets[b.selection] !== undefined) currentBets[b.selection] += b.amount;
    });

    if (adminForcedResult) {
        let finalNum = 0, finalColor = '', finalSize = '';
        if (adminForcedResult.type === 'number') {
            finalNum = parseInt(adminForcedResult.value);
        } else if (adminForcedResult.type === 'color') {
            if (adminForcedResult.value === 'Green') finalNum = 1;
            else if (adminForcedResult.value === 'Red') finalNum = 2;
            else if (adminForcedResult.value === 'Violet') finalNum = 0;
        } else if (adminForcedResult.type === 'size') {
            finalNum = adminForcedResult.value === 'Big' ? 6 : 2;
        }
        finalSize = finalNum >= 5 ? 'Big' : 'Small';
        if (finalNum === 0 || finalNum === 5) finalColor = 'Violet';
        else if (finalNum % 2 === 0) finalColor = 'Red';
        else finalColor = 'Green';
        return { number: finalNum, color: finalColor, size: finalSize, isForced: true };
    }

    let minPayout = Infinity;
    let bestNumber = 0;

    for (let i = 0; i <= 9; i++) {
        let currentPayout = 0;
        let numStr = i.toString();
        let sizeStr = i >= 5 ? 'Big' : 'Small';

        if (currentBets[numStr]) currentPayout += currentBets[numStr] * 9;
        if (currentBets[sizeStr]) currentPayout += currentBets[sizeStr] * 2;

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

        if (currentPayout < minPayout) {
            minPayout = currentPayout;
            bestNumber = i;
        }
    }

    let winColor = (bestNumber === 0 || bestNumber % 2 === 0) ? 'Red' : 'Green';
    if(bestNumber === 0 || bestNumber === 5) winColor = 'Violet';
    let winSize = bestNumber >= 5 ? 'Big' : 'Small';

    return { number: bestNumber, color: winColor, size: winSize, isForced: false };
}

setInterval(async () => {
    const actualPeriod = Math.floor(Date.now() / 60000);
    if (actualPeriod > currentActivePeriod) {
        
        const result = calculateWinningResult(currentPeriodBets, adminNextResult);
        adminNextResult = null;

        for (let bet of currentPeriodBets) {
            try {
                let user = await User.findOne({ mobile: bet.mobile });
                if (!user) continue;

                let won = false;
                let multiplier = 0;

                if (bet.selection === result.number.toString()) { won = true; multiplier = 9; }
                else if (bet.selection === result.color) { 
                    won = true; 
                    multiplier = (result.color === 'Violet') ? 4.5 : ((result.number === 0 || result.number === 5) ? 1.5 : 2); 
                }
                else if (bet.selection === result.size) { won = true; multiplier = 2; }

                let historyItem = user.gameHistory.find(h => h.period === bet.period && h.selection === bet.selection && h.status === 'Pending');

                if (won) {
                    let winAmount = bet.amount * multiplier;
                    user.mainBalance += winAmount;
                    if (historyItem) historyItem.status = 'Won';
                } else {
                    if (historyItem) historyItem.status = 'Lost';
                }
                await user.save();
            } catch (err) {
                console.log("Error processing user payout:", err);
            }
        }

        try {
            const newRes = new Result({ period: currentActivePeriod, number: result.number, color: result.color, size: result.size });
            await newRes.save();
        } catch(e) {}

        liveHistory.unshift({ period: currentActivePeriod, number: result.number, color: result.color, size: result.size });
        if (liveHistory.length > 10) liveHistory.pop();
        
        currentActivePeriod = actualPeriod;
        currentPeriodBets = [];
    }
}, 1000);

app.post('/bet', async (req, res) => {
    try {
        const { mobile, betSelection, betAmount, period } = req.body;
        const user = await User.findOne({ mobile });
        if (!user || user.mainBalance < betAmount) return res.json({ success: false, message: "Insufficient Balance!" });

        user.mainBalance -= betAmount;
        user.gameHistory.push({ period, selection: betSelection, amount: betAmount, status: 'Pending' });
        await user.save();

        currentPeriodBets.push({ mobile, selection: betSelection, amount: betAmount, period });

        res.json({ success: true, balance: user.mainBalance, message: "Bet Placed Successfully!" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/admin/set-game-result', (req, res) => {
    const { type, value } = req.body; 
    adminNextResult = { type, value };
    res.json({ success: true, message: `Fixed Next Winner: ${value}` });
});

app.get('/admin/live-game-data', (req, res) => {
    const remainingTime = 60 - new Date().getSeconds();
    let betTotals = { Green: 0, Violet: 0, Red: 0, Big: 0, Small: 0, '0':0, '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0 };
    currentPeriodBets.forEach(b => {
        if(betTotals[b.selection] !== undefined) betTotals[b.selection] += b.amount;
    });
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

app.get('/game-status', (req, res) => {
    const remainingTime = 60 - new Date().getSeconds();
    res.json({ period: currentActivePeriod, time: remainingTime, results: liveHistory });
});

app.get('/', (req, res) => {
    res.send("🚀 Live Game Backend is Running!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
