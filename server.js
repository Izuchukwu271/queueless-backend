const express = require("express");

const app = express();

const PORT = 3000;

app.get("/",(req, res)=>{
    res.send("Queueless backend is running!");
});

app.listen(PORT, ()=>{
    console.log(`Queueless server running on port ${PORT}`);
});