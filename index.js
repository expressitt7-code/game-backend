const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

let users = {};          
let currentPeriodBits = {}; 
let gameHistory = [];
let lastGeneratedPeriod = 0;

let depositRequests = []; 
let withdrawals = [];

function generateUniqueId() {
    return 'UID' + Math.floor(100000 + Math.random() * 900000);
}

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
    return bestNumbers[Math.floor(Math.random() * bestNumbers.length)];
}

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
            
            gameHistory.unshift({ period: lastGeneratedPeriod, number: winningNumber, color: winColor });
            if (gameHistory.length > 10) gameHistory.pop();
        }
        lastGeneratedPeriod = currentPeriod;
    }
    return { period: currentPeriod, time: timeLeft, results: gameHistory };
}

app.post('/register', (req, res) => {
    const { mobile, password, refCode } = req.body;
    if (!mobile || !password) return res.json({ success: false, message: "Mobile & Password required" });
    if (users[mobile]) return res.json({ success: false, message: "Mobile number already registered!" });

    let uniqueId = generateUniqueId();
    let initialBonus = 0;

    if (refCode && Object.values(users).some(u => u.uniqueId === refCode)) {
        initialBonus = 100; 
        let referrerMobile = Object.keys(users).find(m => users[m].uniqueId === refCode);
        if (referrerMobile) {
            users[referrerMobile].bonusBalance = (users[referrerMobile].bonusBalance || 0) + 50;
        }
    }

    users[mobile] = {
        password: password,
        uniqueId: uniqueId,
        balance: 0.00,
        depositBalance: 0.00,
        bonusBalance: initialBonus,
        history: []
    };

    res.json({ success: true, uniqueId: uniqueId, message: "Account created successfully!" });
});

app.post('/login', (req, res) => {
    const { mobile, password } = req.body;
    if (!users[mobile] || users[mobile].password !== password) {
        return res.json({ success: false, message: "Invalid mobile number or password!" });
    }
    let user = users[mobile];
    res.json({ success: true, uniqueId: user.uniqueId, balance: user.balance, depositBalance: user.depositBalance, bonusBalance: user.bonusBalance });
});

app.post('/get-account-data', (req, res) => {
    const { mobile } = req.body;
    if (!users[mobile]) return res.json({ success: false });
    let user = users[mobile];
    res.json({ success: true, uniqueId: user.uniqueId, balance: user.balance, depositBalance: user.depositBalance, bonusBalance: user.bonusBalance });
});

app.get('/game-status', (req, res) => {
    res.json(getGameState());
});

app.post('/bet', (req, res) => {
    const { mobile, betSelection, betAmount, period } = req.body;
    if (!users[mobile]) return res.json({ success: false, message: "User not found" });

    let user = users[mobile];
    let totalAvailable = user.balance + user.depositBalance + user.bonusBalance;

    if (totalAvailable < betAmount) {
        return res.json({ success: false, message: "Insufficient total balance!" });
    }

    let remaining = betAmount;

    if (user.bonusBalance >= remaining) {
        user.bonusBalance -= remaining;
        remaining = 0;
    } else {
        remaining -= user.bonusBalance;
        user.bonusBalance = 0;
    }

    if (remaining > 0) {
        if (user.depositBalance >= remaining) {
            user.depositBalance -= remaining;
            remaining = 0;
        } else {
            remaining -= user.depositBalance;
            user.depositBalance = 0;
        }
    }

    if (remaining > 0) {
        user.balance -= remaining;
    }

    if (!currentPeriodBits[period]) currentPeriodBits[period] = [];
    currentPeriodBits[period].push({ mobile, selection: betSelection, amount: betAmount });

    user.history.push({ period, selection: betSelection, amount: betAmount, status: 'Pending' });

    res.json({ success: true, balance: user.balance, depositBalance: user.depositBalance, bonusBalance: user.bonusBalance });
});

app.post('/add-reward', (req, res) => {
    const { mobile, amount } = req.body;
    if (!users[mobile]) return res.json({ success: false });
    users[mobile].balance += amount;
    res.json({ success: true, balance: users[mobile].balance });
});

app.post('/deposit-request', (req, res) => {
    const { mobile, amount, utr } = req.body;
    if (!mobile || !amount || !utr) return res.json({ success: false, message: "All fields required" });
    if (amount < 100) return res.json({ success: false, message: "Minimum deposit amount is ₹100" });

    depositRequests.push({ id: 'DEP_' + Date.now(), mobile, amount, utr, status: 'Pending', time: new Date().toLocaleString() });
    res.json({ success: true, message: "Deposit request submitted to admin successfully!" });
});

app.post('/withdraw-request', (req, res) => {
    const { mobile, amount, upiId } = req.body;
    if (!users[mobile]) return res.json({ success: false, message: "User not found" });
    
    if (users[mobile].balance < amount) {
        return res.json({ success: false, message: "Insufficient withdrawable main balance!" });
    }

    users[mobile].balance -= amount;
    withdrawals.push({ id: 'WITH_' + Date.now(), mobile, amount, upiId, status: 'Pending', time: new Date().toLocaleString() });
    res.json({ success: true, balance: users[mobile].balance });
});

app.post('/user-history', (req, res) => {
    const { mobile } = req.body;
    res.json({
        success: true,
        deposits: depositRequests.filter(d => d.mobile === mobile),
        withdrawals: withdrawals.filter(w => w.mobile === mobile)
    });
});

app.get('/', (req, res) => { res.send("🟢 Game Backend Active!"); });
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
