const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// In-Memory Database
let users = {};          // { telegramId: { balance: 1000, history: [] } }
let currentPeriodBits = {}; 
let gameHistory = [];
let lastGeneratedPeriod = 0;

let depositRequests = [];   // [{ id, telegramId, amount, utr, status: 'Pending', time }]
let withdrawals = [];     // [{ id, telegramId, amount, upiId, status: 'Pending', time }]

// 🎮 GAME LOGIC (Smart Algorithm)
function getLiabilityForNumber(number, bets) {
    let liability = 0;
    let color1 = ""; let color2 = "";
    if (number === 0) { color1 = 'Red'; color2 = 'Violet'; }
    else if (number === 5) { color1 = 'Green'; color2 = 'Violet'; }
    else if (number % 2 === 0) { color1 = 'Red'; }
    else { color1 = 'Green'; }

    let bs = number > 4 ? 'Big' : 'Small';

    bets.forEach(bet => {
        if (bet.selection === number.toString()) liability += bet.amount * 9;
        if (bet.selection === color1) liability += bet.amount * 2;
        if (color2 && bet.selection === color2) liability += bet.amount * 4.5;
        if (bet.selection === bs) liability += bet.amount * 2;
    });
    return liability;
}

function generateSmartResult(p) {
    let bets = currentPeriodBits[p] || [];
    if (bets.length === 0) return Math.floor(Math.random() * 10);

    let lowestLiability = Infinity;
    let bestNumbers = [];

    for (let i = 0; i <= 9; i++) {
        let liability = getLiabilityForNumber(i, bets);
        if (liability < lowestLiability) {
            lowestLiability = liability;
            bestNumbers = [i];
        } else if (liability === lowestLiability) {
            bestNumbers.push(i);
        }
    }
    let randomIndex = Math.floor(Math.random() * bestNumbers.length);
    return bestNumbers[randomIndex];
}

// GAME TIMER LOOP
function getGameState() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const yyyy = istTime.getUTCFullYear();
    const mm = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(istTime.getUTCDate()).padStart(2, '0');
    
    const totalMinutesToday = (istTime.getUTCHours() * 60) + istTime.getUTCMinutes();
    const periodStr = `${yyyy}${mm}${dd}${String(totalMinutesToday).padStart(4, '0')}`;
    const currentPeriod = parseInt(periodStr);

    const secondsPassed = istTime.getUTCSeconds();
    const timeLeft = 60 - secondsPassed;

    if (currentPeriod > lastGeneratedPeriod) {
        if (lastGeneratedPeriod !== 0) {
            let winningNumber = generateSmartResult(lastGeneratedPeriod);
            let winColor = (winningNumber === 0 || winningNumber === 5) ? 'Violet' : (winningNumber % 2 === 0 ? 'Red' : 'Green');
            
            gameHistory.unshift({
                period: lastGeneratedPeriod,
                number: winningNumber,
                color: winColor
            });
            if (gameHistory.length > 10) gameHistory.pop();
        }
        lastGeneratedPeriod = currentPeriod;
    }

    return { period: currentPeriod, time: timeLeft, results: gameHistory };
}

// API ENDPOINTS
app.get('/game-status', (req, res) => {
    res.json(getGameState());
});

app.post('/bet', (req, res) => {
    const { telegramId, betSelection, betAmount, period } = req.body;
    if (!telegramId) return res.status(400).json({ success: false, message: "Invalid User" });

    if (!users[telegramId]) users[telegramId] = { balance: 1000.00, history: [] };

    if (users[telegramId].balance < betAmount) {
        return res.json({ success: false, message: "Insufficient balance!" });
    }

    users[telegramId].balance -= betAmount;

    if (!currentPeriodBits[period]) currentPeriodBits[period] = [];
    currentPeriodBits[period].push({ telegramId, selection: betSelection, amount: betAmount });

    users[telegramId].history.push({ period, selection: betSelection, amount: betAmount, status: 'Pending' });

    res.json({ success: true, newBalance: users[telegramId].balance });
});

// EARN REWARD API (Watch Ads)
app.post('/add-reward', (req, res) => {
    const { telegramId, amount } = req.body;
    if (!telegramId) return res.status(400).json({ success: false });

    if (!users[telegramId]) users[telegramId] = { balance: 1000.00, history: [] };
    users[telegramId].balance += amount;

    res.json({ success: true, newBalance: users[telegramId].balance });
});

// DEPOSIT API
app.post('/deposit-request', (req, res) => {
    const { telegramId, amount, utr } = req.body;
    if (!telegramId || !amount || !utr) return res.status(400).json({ success: false });

    let newReq = { id: 'DEP_' + Date.now(), telegramId, amount, utr, status: 'Pending', time: new Date().toLocaleString() };
    depositRequests.push(newReq);
    res.json({ success: true, message: "Request received successfully" });
});

// WITHDRAWAL API
app.post('/withdraw-request', (req, res) => {
    const { telegramId, amount, upiId } = req.body;
    if (!telegramId || !amount || !upiId) return res.status(400).json({ success: false, message: "Invalid data" });

    if (!users[telegramId]) users[telegramId] = { balance: 1000.00, history: [] };
    if (users[telegramId].balance < amount) return res.json({ success: false, message: "Insufficient balance" });

    // Balance turant cut karlo
    users[telegramId].balance -= amount;

    let newReq = { id: 'WITH_' + Date.now(), telegramId, amount, upiId, status: 'Pending', time: new Date().toLocaleString() };
    withdrawals.push(newReq);

    res.json({ success: true, newBalance: users[telegramId].balance });
});

// USER HISTORY API (Deposit & Withdraw status track karne ke liye)
app.post('/user-history', (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ success: false });

    const userDeposits = depositRequests.filter(d => d.telegramId === telegramId);
    const userWithdrawals = withdrawals.filter(w => w.telegramId === telegramId);

    res.json({ success: true, deposits: userDeposits, withdrawals: userWithdrawals });
});

// ADMIN PANEL APIs
app.get('/admin/pending-deposits', (req, res) => {
    let pending = depositRequests.filter(r => r.status === 'Pending');
    res.json({ requests: pending });
});

app.post('/admin/approve-deposit', (req, res) => {
    const { requestId, action } = req.body;
    let reqObj = depositRequests.find(r => r.id === requestId);
    if (!reqObj) return res.status(404).json({ message: "Not found" });

    reqObj.status = action; // 'approve' ya 'reject'
    if (action === 'approve') {
        if (!users[reqObj.telegramId]) users[reqObj.telegramId] = { balance: 1000.00, history: [] };
        users[reqObj.telegramId].balance += reqObj.amount;
    }
    res.json({ message: `Deposit ${action}ed successfully!` });
});

app.get('/admin/pending-withdrawals', (req, res) => {
    let pending = withdrawals.filter(r => r.status === 'Pending');
    res.json({ requests: pending });
});

app.post('/admin/approve-withdraw', (req, res) => {
    const { requestId, action } = req.body;
    let reqObj = withdrawals.find(r => r.id === requestId);
    if (!reqObj) return res.status(404).json({ message: "Not found" });

    reqObj.status = action; // 'approve' ya 'reject'
    if (action === 'reject') {
        // Agar reject kiya toh paise wapas refund kar do
        if (!users[reqObj.telegramId]) users[reqObj.telegramId] = { balance: 1000.00, history: [] };
        users[reqObj.telegramId].balance += reqObj.amount;
    }
    res.json({ message: action === 'approve' ? "Withdrawal Approved!" : "Rejected & Refunded!" });
});

app.get('/', (req, res) => {
    res.send("🟢 Backend with Full Admin & History System is Running!");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
