const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 🗄️ In-Memory Database
let users = {}; 
let currentPeriodBets = []; 
let gameHistory = [];
let lastGeneratedPeriod = 0;

function getLiabilityForNumber(number, bets) {
    let liability = 0;
    let color1 = '';
    let color2 = '';
    if (number === 0) { color1 = 'Red'; color2 = 'Violet'; }
    else if (number === 5) { color1 = 'Green'; color2 = 'Violet'; }
    else if (number % 2 === 0) { color1 = 'Red'; }
    else { color1 = 'Green'; }

    let bs = number > 4 ? 'Big' : 'Small';

    bets.forEach(bet => {
        if (bet.selection === number.toString()) liability += bet.amount * 9;
        if (bet.selection === color1) liability += (color2 !== '' ? bet.amount * 1.5 : bet.amount * 2);
        if (color2 !== '' && bet.selection === color2) liability += bet.amount * 4.5; 
        if (bet.selection === bs) liability += bet.amount * 2;
    });
    return liability;
}

function generateSmartResult() {
    if (currentPeriodBets.length === 0) return Math.floor(Math.random() * 10); 

    let lowestLiability = Infinity;
    let bestNumbers = [];

    for (let i = 0; i <= 9; i++) {
        let liability = getLiabilityForNumber(i, currentPeriodBets);
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
            const winNumber = generateSmartResult();
            let winColor = (winNumber === 0 || winNumber === 5) ? 'Violet' : (winNumber % 2 === 0 ? 'Red' : 'Green');
            let winBS = winNumber > 4 ? 'Big' : 'Small';

            gameHistory.unshift({ period: lastGeneratedPeriod, number: winNumber, color: winColor });
            if (gameHistory.length > 10) gameHistory = gameHistory.slice(0, 10);

            currentPeriodBets.forEach(bet => {
                let userObj = users[bet.tgId];
                if(userObj) {
                    let userBetRecord = userObj.history.find(b => b.period === bet.period && b.selection === bet.selection);
                    let won = false;
                    let multiplier = 0;

                    if (bet.selection === winNumber.toString()) { won = true; multiplier = 9; }
                    else if (bet.selection === winColor) { 
                        won = true; 
                        multiplier = (winColor === 'Violet') ? 4.5 : ((winNumber === 0 || winNumber === 5) ? 1.5 : 2); 
                    }
                    else if (bet.selection === winBS) { won = true; multiplier = 2; }

                    if (won) {
                        userObj.balance += (bet.amount * multiplier);
                        if(userBetRecord) userBetRecord.status = 'Won';
                    } else {
                        if(userBetRecord) userBetRecord.status = 'Lost';
                    }
                }
            });
            currentPeriodBets = [];
        }
        lastGeneratedPeriod = currentPeriod;
    }
    return { period: currentPeriod, time: timeLeft, results: gameHistory };
}

// 🔌 API ENDPOINTS
app.get('/game-status', (req, res) => { res.json(getGameState()); });

app.post('/get-balance', (req, res) => {
    const { telegramId } = req.body;
    if (!users[telegramId]) users[telegramId] = { balance: 1000.00, history: [] }; 
    res.json({ success: true, balance: users[telegramId].balance });
});

app.post('/my-history', (req, res) => {
    const { telegramId } = req.body;
    let hist = users[telegramId] ? users[telegramId].history : [];
    res.json({ success: true, history: hist });
});

app.post('/bet', (req, res) => {
    const { telegramId, betSelection, betAmount, period } = req.body;
    if (!users[telegramId]) users[telegramId] = { balance: 1000.00, history: [] };
    if (users[telegramId].balance < betAmount) {
        return res.json({ success: false, message: "Insufficient balance" });
    }
    users[telegramId].balance -= betAmount;
    let newBet = { tgId: telegramId, period, selection: betSelection, amount: betAmount, status: 'Pending' };
    currentPeriodBets.push(newBet); 
    users[telegramId].history.push(newBet); 
    res.json({ success: true, newBalance: users[telegramId].balance });
});

// 🌟 NEW: AD REWARD API 🌟
app.post('/add-reward', (req, res) => {
    const { telegramId, amount, type } = req.body;
    if (!users[telegramId]) users[telegramId] = { balance: 1000.00, history: [] };
    
    users[telegramId].balance += amount; // User ke account mein paise add karna
    
    res.json({ success: true, newBalance: users[telegramId].balance });
});

app.get('/', (req, res) => { res.send("🟢 Advance Loss-Prevention & Ads Algorithm is Running!"); });

app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
