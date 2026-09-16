const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Game Variables
let periodId = 20240213010; // Shuruaati Period ID
let timeLeft = 60; // 60 seconds ka timer
let history = []; // Purane results yahan save honge

// Yeh Timer lagataar Server par chalta rahega
setInterval(() => {
    timeLeft--;
    
    if (timeLeft <= 0) {
        // Result Generate karna (0 se 9 ke beech)
        const randomNumber = Math.floor(Math.random() * 10);
        let color = "";
        
        // Color decide karna
        if (randomNumber === 0 || randomNumber === 5) {
            color = "Violet";
        } else if (randomNumber % 2 === 0) {
            color = "Red"; // 2, 4, 6, 8
        } else {
            color = "Green"; // 1, 3, 7, 9
        }

        // Result ko history mein daalna
        history.unshift({ period: periodId, number: randomNumber, color: color });
        
        // Agar history 10 se zyada ho jaye toh purane mita do
        if (history.length > 10) history.pop();

        // Naya Period shuru karna
        periodId++;
        timeLeft = 60; 
    }
}, 1000);

// API 1: Frontend ko Timer aur Result bhejna
app.get('/game-status', (req, res) => {
    res.json({
        period: periodId,
        time: timeLeft,
        results: history
    });
});

// API 2: User ki bet (paise) accept karna
app.post('/place-bet', (req, res) => {
    const { amount, selection } = req.body;
    
    if (!amount || !selection) {
        return res.status(400).json({ error: "Invalid Bet" });
    }

    console.log(`Bet Received: ₹${amount} on ${selection}`);
    // Yahan hum aage chalkar User ka balance deduct karne ka code lagayenge
    
    res.json({ message: "Bet placed successfully!", status: "success" });
});

// Basic test URL
app.get('/', (req, res) => {
    res.send("🟢 Color Prediction Backend is LIVE!");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
