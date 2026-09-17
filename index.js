const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 🗄️ In-Memory Database (Aage MongoDB se replace karenge)
let users = {}; 
let currentPeriodBets = []; 
let gameHistory = [];
let lastGeneratedPeriod = 0;

// 🧠 LOGIC: Calculate Total Payout (Liability) for each possible outcome (0-9)
function getLiabilityForNumber(number, bets) {
    let liability = 0;
    
    // Number ke hisaab se uska Color set karna
    let color1 = '';
    let color2 = '';
    if (number === 0) { color1 = 'Red'; color2 = 'Violet'; }
    else if (number === 5) { color1 = 'Green'; color2 = 'Violet'; }
    else if (number % 2 === 0) { color1 = 'Red'; }
    else { color1 = 'Green'; }

    // Number ke hisaab se Big/Small set karna
    let bs = number > 4 ? 'Big' : 'Small';

    bets.forEach(bet => {
        // 1. Number Betting Check (Pays 9x)
        if (bet.selection === number.toString()) {
            liability += bet.amount * 9;
        }
        
        // 2. Color Betting Check
        if (bet.selection === color1) {
            // Agar 0 ya 5 aaya hai, toh Red/Green ka payout 1.5x hota hai, warna 2x
            liability += (color2 !== '' ? bet.amount * 1.5 : bet.amount * 2);
        }
        if (color2 !== '' && bet.selection === color2) {
            // Violet par 4.5x payout hota hai
            liability += bet.amount * 4.5; 
        }
        
        // 3. Big / Small Betting Check (Pays 2x)
        if (bet.selection === bs) {
            liability += bet.amount * 2;
        }
    });

    return liability;
}

// 🎯 MAIN GAME ALGORITHM: Jis combination pe 0 ya Sabse kam bet hai, wo jitega
function generateSmartResult() {
    // Agar kisi ne koi bet nahi lagayi, toh random result nikal do
    if (currentPeriodBets.length === 0) {
        return Math.floor(Math.random() * 10); 
    }

    let lowestLiability = Infinity;
    let bestNumbers = [];

    // 0 se 9 tak sabhi numbers ka total payout calculate karo
    for (let i = 0; i <= 9; i++) {
        let liability = getLiabilityForNumber(i, currentPeriodBets);
        
        if (liability < lowestLiability) {
            lowestLiability = liability;
            bestNumbers = [i]; 
        } else if (liability === lowestLiability) {
            bestNumbers.push(i);
        }
    }

    // Agar ek se zyada numbers par same lowest bet (ya 0 bet) hai, toh unme se random ek chuno
    let randomIndex = Math.floor(Math.random() * bestNumbers.length);
    return bestNumbers[randomIndex];
}

// 🕒 GAME LOOP: Timer ke hisaab se naya result generate karna
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

    // Jaise hi naya period shuru ho (Timer reset ho)
    if (currentPeriod > lastGeneratedPeriod) {
        if (lastGeneratedPeriod !== 0) {
            
            // 🚀 SMART ALGORITHM CALL
            const winNumber = generateSmartResult();
            
            let winColor = (winNumber === 0 || winNumber === 5) ? 'Violet' : (winNumber % 2 === 0 ? 'Red' : 'Green');
            let winBS = winNumber > 4 ? 'Big' : 'Small';

            // History Update
            gameHistory.unshift({ period: lastGeneratedPeriod, number: winNumber, color: winColor });
            if (gameHistory.length > 10) gameHistory = gameHistory.slice(0, 10);

            // Users ka balance update karna
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

            // Agle round ke liye bets clear kar do
            currentPeriodBets = [];
        }
        lastGeneratedPeriod = currentPeriod;
    }

    return { period: currentPeriod, time: timeLeft, results: gameHistory };
}


// 🔌 API ENDPOINTS

app.get('/game-status', (req, res) => {
    res.json(getGameState());
});

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

app.get('/', (req, res) => {
    res.send("🟢 Advance Loss-Prevention Algorithm is Running!");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
