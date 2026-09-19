const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 🌟 MONGODB CONNECTION (Database) 🌟
const DB_URL = "mongodb+srv://New_admin:h2VMUsM7a3W39J4E@cluster0.ydaktjx.mongodb.net/?appName=Cluster0";
mongoose.connect(DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("✅ Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Error: ", err));

// 🌟 USER SCHEMA (Database me kya kya save hoga) 🌟
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
// 🌟 1. AUTHENTICATION APIs (Login / Signup) 🌟
// ==========================================
app.post('/register', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        const existingUser = await User.findOne({ mobile });
        if (existingUser) return res.json({ success: false, message: "Mobile number already registered!" });

        const uniqueId = "UID" + Math.floor(1000000 + Math.random() * 9000000);
        const newUser = new User({ mobile, password, uniqueId });
        await newUser.save();
        res.json({ success: true, message: "Registration Successful!", uniqueId });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/login', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        const user = await User.findOne({ mobile, password });
        if (user) {
            res.json({ success: true, message: "Login Successful!" });
        } else {
            res.json({ success: false, message: "Invalid Mobile or Password!" });
        }
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/get-account-data', async (req, res) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ mobile });
        if (user) {
            res.json({ success: true, balance: user.mainBalance, depositBalance: user.depositBalance, bonusBalance: user.bonusBalance, uniqueId: user.uniqueId });
        } else { res.json({ success: false, message: "User not found" }); }
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

// ==========================================
// 🌟 2. USER DEPOSIT & WITHDRAW APIs 🌟
// ==========================================
app.post('/deposit-request', async (req, res) => {
    try {
        const { mobile, amount, utr } = req.body;
        const reqId = "DEP" + Date.now();
        const dateStr = new Date().toLocaleString();

        await User.updateOne({ mobile }, {
            $push: { deposits: { id: reqId, amount, utr, date: dateStr, status: 'pending' } }
        });
        res.json({ success: true, message: "Deposit request submitted. Awaiting Admin Approval." });
    } catch (err) { res.json({ success: false, message: "Error submitting deposit" }); }
});

app.post('/withdraw-request', async (req, res) => {
    try {
        const { mobile, amount, upiId } = req.body;
        const user = await User.findOne({ mobile });

        if(user.mainBalance < amount) {
            return res.json({ success: false, message: "Insufficient Balance!" });
        }
        if(amount < 500) {
            return res.json({ success: false, message: "Minimum withdrawal is ₹500" });
        }

        user.mainBalance -= amount;
        const reqId = "WID" + Date.now();
        const dateStr = new Date().toLocaleString();

        user.withdrawals.push({ id: reqId, amount, upiId, date: dateStr, status: 'pending' });
        await user.save();

        res.json({ success: true, message: "Withdrawal request submitted." });
    } catch (err) { res.json({ success: false, message: "Error submitting withdrawal" }); }
});

// ==========================================
// 🌟 3. ADMIN PANEL APIs 🌟
// ==========================================
app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 }).sort({ _id: -1 });
        res.json({ success: true, users });
    } catch (err) { res.json({ success: false, message: "Error fetching data" }); }
});

app.get('/admin/pending-deposits', async (req, res) => {
    try {
        const users = await User.find({ "deposits.status": "pending" });
        let requests = [];
        users.forEach(u => {
            u.deposits.filter(d => d.status === 'pending').forEach(d => {
                requests.push({ mobile: u.mobile, id: d.id, amount: d.amount, utr: d.utr, date: d.date });
            });
        });
        res.json({ success: true, requests });
    } catch (err) { res.json({ success: false, message: "Error" }); }
});

app.get('/admin/pending-withdrawals', async (req, res) => {
    try {
        const users = await User.find({ "withdrawals.status": "pending" });
        let requests = [];
        users.forEach(u => {
            u.withdrawals.filter(w => w.status === 'pending').forEach(w => {
                requests.push({ mobile: u.mobile, id: w.id, amount: w.amount, upiId: w.upiId, date: w.date });
            });
        });
        res.json({ success: true, requests });
    } catch (err) { res.json({ success: false, message: "Error" }); }
});

app.post('/admin/approve-deposit', async (req, res) => {
    try {
        const { requestId, action } = req.body;
        const user = await User.findOne({ "deposits.id": requestId });
        if (!user) return res.json({ success: false, message: "Request not found" });

        const depositIndex = user.deposits.findIndex(d => d.id === requestId);
        if (action === 'approve') {
            user.deposits[depositIndex].status = 'approved';
            user.mainBalance += user.deposits[depositIndex].amount;
        } else {
            user.deposits[depositIndex].status = 'rejected';
        }

        await user.save();
        res.json({ success: true, message: action === 'approve' ? "Deposit Approved & Balance Added!" : "Deposit Rejected!" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/admin/approve-withdraw', async (req, res) => {
    try {
        const { requestId, action } = req.body;
        const user = await User.findOne({ "withdrawals.id": requestId });
        if (!user) return res.json({ success: false, message: "Request not found" });

        const withIndex = user.withdrawals.findIndex(w => w.id === requestId);
        if (action === 'approve') {
            user.withdrawals[withIndex].status = 'approved';
        } else {
            user.withdrawals[withIndex].status = 'rejected';
            user.mainBalance += user.withdrawals[withIndex].amount;
        }

        await user.save();
        res.json({ success: true, message: action === 'approve' ? "Withdrawal Approved!" : "Withdrawal Rejected & Refunded!" });
    } catch (err) { res.json({ success: false, message: "Server Error" }); }
});

// ==========================================
// 🌟 4. GAME STATUS API (Timer Setup) 🌟
// ==========================================
app.get('/game-status', (req, res) => {
    const now = new Date();
    const seconds = now.getSeconds();
    const remainingTime = 60 - seconds;
    const period = Math.floor(now.getTime() / 60000);

    res.json({
        period: period,
        time: remainingTime,
        results: [
            { period: period - 1, number: 3, color: 'Green' },
            { period: period - 2, number: 8, color: 'Red' },
            { period: period - 3, number: 0, color: 'Violet' }
        ]
    });
});

// STARTING THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
