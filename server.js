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
    VALUES ($1, $2, $3, $4)
    RETURNING id, business_name, phone, location`,
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
app.post("/staff", async(req, res)=>{
    try{
        const {business_id, staff_name}= req.body;

        const result = await pool.query(
            `INSERT INTO staff
            (business_id, staff_name)
            VALUES ($1 , $2)
            RETURNING id, business_id, staff_name, available`,
            [business_id, staff_name]
        );
        res.status(201).json({
            message:"staff added successfully!",
            staff: result.rows[0]
        });
    }catch(error){
        console.error(error);
        res.status(500).json({
            message: "Failed to add staff."
        });
    }
});
app.post("/queues", async (req, res) => {
    try {
        const { business_id, phone, people } = req.body;

        // Find the highest ticket number for this business
        const result = await pool.query(
            `SELECT MAX(
                CAST(SUBSTRING(ticket FROM 2) AS INTEGER)
            ) AS last_ticket
            FROM queues
            WHERE business_id = $1`,
            [business_id]
        );

        const lastTicket = result.rows[0].last_ticket || 0;

        // Generate the next ticket
        const ticket = `A${String(lastTicket + 1).padStart(2, "0")}`;

        // Add customer to queue
        const newQueue = await pool.query(
            `INSERT INTO queues
            (business_id, phone, people, ticket)
            VALUES ($1, $2, $3, $4)
            RETURNING id, business_id, phone, people, ticket, status`,
            [business_id, phone, people, ticket]
        );

        res.status(201).json({
            message: "Customer added to queue successfully!",
            queue: newQueue.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to add customer to queue."
        });
    }
});

app.listen(PORT, ()=>{
    console.log(`Queueless server running on port ${PORT}`);
});