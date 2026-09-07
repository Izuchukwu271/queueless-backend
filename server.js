const express = require("express");
const {Pool} = require("pg");
const bcrypt = require("bcrypt");
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
        const hashedPassword = await bcrypt.hash(password,10);

        const result = await pool.query(
    `INSERT INTO businesses
    (business_name, phone, password, location)
    VALUES ($1, $2, $3, $4)
    RETURNING id, business_name, phone, location`,
    [business_name, phone, hashedPassword, location]
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

app.get("/queues/:business_id", async(req, res)=>{
    try{
        const {business_id} = req.params;
        const result = await pool.query(
            `SELECT id, business_id, phone, people, ticket, status
            FROM queues
            WHERE business_id = $1
            ORDER BY id ASC
            `,
            [business_id]
        );

        res.status(200).json({
            business_id: business_id,
            queue: result.rows
        });
    }catch(error){
        console.error(error);

        res.status(500).json({
            message:"Failed to get queue"
        });
    }
});
app.patch("/queues/:business_id/next", async(req, res)=>{
    const client = await pool.connect();
    try{
        const {business_id}=req.params;
        await client.query("BEGIN");

        //Find a staff available
        const staffResult = await client.query(
            `SELECT id, staff_name
            FROM staff
            WHERE business_id = $1
            AND available = TRUE
            LIMIT 1`,
            [business_id]
        );
        if(staffResult.rows.length === 0){
              await client.query("ROLLBACK");

            return res.status(404).json({
                message: "No staff member is currently available."
            });
        }
        const staff = staffResult.rows[0];

        // find the next waiting customer
        const queueResult = await client.query(
            `SELECT id
            FROM queues
            WHERE business_id = $1
            AND status = 'waiting'
            ORDER BY id ASC
            LIMIT 1`,
            [business_id]
        );
        if(queueResult.rows.length === 0){
             await client.query("ROLLBACK");
            return res.status(404).json({
                message:"No customers are waiting."
            });
        }
        const customer = queueResult.rows[0];

        // Assign staff and start serving customer

        const result = await client.query(
            `UPDATE queues
            SET status = 'serving',
              staff_id = $1
            WHERE id = $2  
            RETURNING id, business_id, phone, people, ticket, status, staff_id`,
            [staff.id, customer.id]
            
        );
        // make the staff member unvailable
        await client.query(
            `UPDATE staff
            SET available = FALSE
            WHERE id = $1`,
            [staff.id]
        );
        // Save both changes permanently
         await client.query("COMMIT");


        res.status(200).json({
            message: "Customer is now being served",
            staff: staff,
            queue: result.rows[0]
        });
    }catch(error){
        await client.query("ROLLBACK");

        console.error(error);
        res.status(500).json({
            message:"Failed to serve next customer."
        });
    }finally{
        client.release();
    }
});

app.patch("/queues/:id/complete", async(req, res)=>{
    const client = await pool.connect();
    try{
        const {id} = req.params;

        await client.query("BEGIN");

        const result = await client.query(
            `UPDATE queues
            SET status = 'completed'
            WHERE id = $1
            AND status = 'serving'
            RETURNING id, business_id, phone, people, ticket, status, staff_id`,
            [id]
        );
        if(result.rows.length === 0){
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Customer is not currently being served.",
            
            });
        }
        const queue = result.rows[0];

        // make the staff member available again

        await client.query(
            `UPDATE staff
            SET available = TRUE
            WHERE id = $1`,
            [queue.staff_id]
        );

        // commit the transaction here
        await client.query("COMMIT");
        res.status(200).json({
             message: "Customer completed successfully!",
                queue: queue
        });
    }catch(error){
        await client.query("ROLLBACK");

        console.error(error);

        res.status(500).json({
            message: "Failed to complete customer."
        });
    }finally{
        client.release();
    }
});
app.patch("/queues/:id/cancel", async(req, res)=>{
    try{
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE  queues
            SET status = 'cancelled'
            WHERE id = $1
            AND status = 'waiting'
            RETURNING id, business_id, phone, people, ticket, status`,
            [id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({
                message: "Customer is not currently waiting."
            });
        }
        res.status(200).json({
            message: "Customer cancelled successfully!",
            queue: result.rows[0]
        });
    }catch(error){
        console.error(error);

        res.status(500).json({
            message: "Failed to cancel customer."
        });
    }
});

app.listen(PORT, ()=>{
    console.log(`Queueless server running on port ${PORT}`);
})