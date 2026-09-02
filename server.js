const express = require("express");
const {Pool} = require("pg");
require("dotenv").config();

const app = express();

app.use(express.json());

const PORT = 3000;

// connect to postgresql
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});
// Test route
app.get("/",(req, res)=>{
    res.send("Queueless backend is running!");
});

// Test database connection
app.get("/test-db", async(req, res)=> {
    try{
        const result = await pool.query("SELECT NOW()");

        res.json({
            message: "Database conneted successfully!",
            time: result.rows[0].now
        });
    }
    catch(error){
        console.error(error);
        res.status(500).send("Database connection failed.");
    }
})

app.post("/businesses", async(req, res)=>{
    try{
        const {business_name, phone, password, location} = req.body;

        const result = await pool.query(
            `INSERT INTO businesses
            (business_name, phone, password, location)
            VALUES($1,$2,$3,$4)
            RETURNING id, business-name, phone, location`,
            [business_name, phone, password, location]
            
        );

        res.status(201).json({
            message: "Business registered successfully",
            business: result.rows[0]
        });
    }
      catch(error){
        console.error(error);
        res.status(500).json({
            message: "Failed to register business."
        });
      }
});

app.listen(PORT, ()=>{
    console.log(`Queueless server running on port ${PORT}`);
});