const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

let history = [];
let lastGeneratedPeriod = 0;

function getGameState() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const yyyy = istTime.getUTCFullYear();
    const mm = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(istTime.getUTCDate()).padStart(2, '0');
    
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const totalMinutesToday = (hours * 60) + minutes;
    
    const periodStr = `${yyyy}${mm}${dd}${String(totalMinutesToday).padStart(4, '0')}`;
    const currentPeriod = parseInt(periodStr);
    
    const secondsPassed = istTime.getUTCSeconds();
    const timeLeft = 60 - secondsPassed;

    if (currentPeriod > lastGeneratedPeriod) {
        if (lastGeneratedPeriod !== 0) {
            const randomNumber = Math.floor(Math.random() * 10);
            let color = "";
            if (randomNumber === 0 || randomNumber === 5) color = "Violet";
            else if (randomNumber % 2 === 0) color = "Red";
            else color = "Green";

            // Naya result sabse upar add hoga
            history.unshift({ period: lastGeneratedPeriod, number: randomNumber, color: color });
            
            // STRICTLY sirf last 10 periods hi rakhein
            if (history.length > 10) {
                history = history.slice(0, 10);
            }
        }
        lastGeneratedPeriod = currentPeriod;
    }

    return {
        period: currentPeriod,
        time: timeLeft,
        results: history
    };
}

app.get('/game-status', (req, res) => {
    res.json(getGameState());
});

app.get('/', (req, res) => {
    res.send("🟢 Win Go Backend is running 24/7!");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
