const express = require("express");
const {Pool} = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());

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

function authenticateToken(req, res, next){
    const authHeader = req.headers["authorization"];

    const token = authHeader && authHeader.split(" ")[1];

    if(!token){
        return res.status(401).json({
            message: "Access denied. No token provided."
        });
    }
    jwt.verify(token, process.env.JWT_SECRET, (error, business)=>{
        if(error){
            return res.status(401).json({
                message: "Invalid or expired token."
            });
        }
        req.business = business;
        next();

    });
}
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
       const business_name = req.body.business_name?.trim();
      const phone = req.body.phone?.trim();
     const password = req.body.password?.trim();
      const location = req.body.location?.trim();
      const slug = business_name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
    if (
    !business_name ||
    !phone ||
    !password ||
    !location ||
    !business_name.trim() ||
    !phone.trim() ||
    !password.trim() ||
    !location.trim()
) {
    return res.status(400).json({
        message: "Business name, phone, password, and location are required."
    });
}

        if(password.length<6){
            return res.status(400).json({
                message: "Password must be at least 6 characters long."
            });
        }

        if(phone.length<8){
            return res.status(400).json({
                message: "phone number must be at least 8 characters long."
            });
        }

        const existingBusiness = await pool.query(
            `SELECT id FROM businesses WHERE phone = $1`,
            [phone]
        );
        if(existingBusiness.rows.length>0){
            return res.status(409).json({
                message: "A business with this phone number already exists."
            });
        }
        const hashedPassword = await bcrypt.hash(password,10);

        const result = await pool.query(
    `INSERT INTO businesses
(business_name, phone, password, location, slug)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, business_name, phone, location, slug`,
    [business_name, phone, hashedPassword, location, slug]
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

app.post("/login", async(req, res)=>{
    try{
        const { phone, password } = req.body;

        const result = await pool.query(
            `SELECT id, business_name, phone, password
            FROM businesses
            WHERE phone =$1`,
            [phone]
        );
        if(result.rows.length === 0){
            return res.status(404).json({
                message:"business not found."
            });
        }
        const business = result.rows[0];
        const passwordMatch = await bcrypt.compare(
            password,
            business.password
        );

        if(!passwordMatch){
            return res.status(401).json({
                message: "Incorrect password."
            });
        }
        const token = jwt.sign(
            {
                id: business.id,
                phone: business.phone
            },
            process.env.JWT_SECRET,
            {
                expiresIn:"1d"
            }
        );
        res.status(200).json({
            message: "Login successful!",
            token: token,
            business: {
                id: business.id,
                business_name: business.business_name,
                phone: business.phone
            }
        });

    }catch(error){
        console.error(error);

        res.status(500).json({
            message: "Login failed."
        });
    }
});
app.post("/staff",authenticateToken, async(req, res)=>{
    try{
        const staff_name = req.body.staff_name?.trim();

        if(!staff_name){
            return res.status(400).json({
                message: "staff name is required"
            });
        }

        const business_id = req.business.id;

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
app.post("/join/:slug", async (req, res) => {
    try {
        const { slug } = req.params;
const customer_name = req.body.customer_name?.trim();
const phone = req.body.phone?.trim();
const people = req.body.people;

        if (!customer_name || !phone || people === undefined) {
    return res.status(400).json({
        message: "Customer name, phone, and number of people are required."
    });
}

if (!Number.isInteger(people) || people <= 0) {
    return res.status(400).json({
        message: "Number of people must be a positive whole number."
    });
}

if (phone.length < 8) {
    return res.status(400).json({
        message: "Phone number must be at least 8 characters long."
    });
}

const businessResult = await pool.query(
    `SELECT id, business_name, location
    FROM businesses
    WHERE slug = $1`,
    [slug]
);

if (businessResult.rows.length === 0) {
    return res.status(404).json({
        message: "Business not found."
    });
}

const business = businessResult.rows[0];
const business_id = business.id;

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
            (business_id, customer_name , phone, people, ticket)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, business_id, customer_name, phone, people, ticket, status`,
            [business_id, customer_name, phone, people, ticket]
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

app.get("/queues/:business_id",authenticateToken,async(req, res)=>{
    try{
        const {business_id} = req.params;
        const tokenBusinessId = req.business.id;
        if(Number(business_id)!== tokenBusinessId){
            return res.status(403).json({
                message:"Access denied. You cannot access another business's queue."
            });
        }
        const result = await pool.query(
            `SELECT id, business_id, customer_name, phone, people, ticket, status, staff_id
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
app.patch("/queues/:business_id/next",authenticateToken, async(req, res)=>{
    const client = await pool.connect();
    try{
        const {business_id}=req.params;
        const tokenBusinessId = req.business.id;

        if(Number(business_id) !== tokenBusinessId){
            return res.status(403).json({
                message: "Access denied. You cannot serve another business's customers."
            });
        }
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
            RETURNING id, business_id, customer_name, phone, people, ticket, status, staff_id`,
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

app.patch("/queues/:id/complete",authenticateToken, async(req, res)=>{
    const client = await pool.connect();
    try{
        const {id} = req.params;
        const tokenBusinessId = req.business.id;

        await client.query("BEGIN");
        const ownershipResult = await client.query(
            `SELECT business_id
            FROM queues
            WHERE id = $1`,
            [id]
        );

        if(ownershipResult.rows.length === 0){
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Queue customer not found."
            });
        }
        const queueBusinessId = ownershipResult.rows[0].business_id;

        if(queueBusinessId !== tokenBusinessId){
            await client.query("ROLLBACK");

            return res.status(403).json({
                message:"Access denied. You cannot complete another business's customer."
            });
        }

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
app.patch("/queues/:id/cancel", authenticateToken, async(req, res)=>{
    try{
        const { id } = req.params;

        const tokenBusinessId = req.business.id;

        const ownershipResult = await pool.query(
            `SELECT business_id
            FROM queues
            WHERE id = $1`,
            [id]
        );

        if(ownershipResult.rows.length === 0){
            return res.status(404).json({
                message: "Queue customer not found."
            });
        }
        const queueBusinessId = ownershipResult.rows[0].business_id;

        if(queueBusinessId !== tokenBusinessId){
            return res.status(403).json({
                message: "Access denied. You cannot cancel another business's customer."
            });
        }

        const result = await pool.query(
            `UPDATE  queues
            SET status = 'cancelled'
            WHERE id = $1
            AND status = 'waiting'
            RETURNING id, business_id, customer_name, phone, people, ticket, status`,
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
app.get("/my-business", authenticateToken, async (req, res)=>{
    try{

    const businessId = req.business.id;
    const result = await pool.query(
        `SELECT id, business_name, phone, location
        FROM businesses
        WHERE id = $1`,
        [businessId]
    );
    if(result.rows.length === 0){
        return res.status(404).json({
            message: "Business not found."
        });
    }

    res.status(200).json({
        business: result.rows[0]
    });
}catch(error){
    console.error(error);

    res.status(500).json({
        message: "Failed to get business information."
    });
}

});

app.get("/my-staff", authenticateToken, async(req, res)=>{
    try{
    const businessId = req.business.id;

    const result = await pool.query(
        `SELECT id, business_id, staff_name, available
        FROM staff
        WHERE business_id = $1
        ORDER BY id ASC`,
        [businessId]
    )
    res.status(200).json({
        staff: result.rows
    });
}catch(error){
    console.error(error);
    res.status(500).json({
        message: "Failed to get staff."
    });
}

});

app.get("/my-queues", authenticateToken, async(req, res)=>{
    try{
    const businessId = req.business.id;

    const result = await pool.query(
        `SELECT id, business_id, customer_name, phone, ticket, status, staff_id
        FROM queues
        WHERE business_id = $1
        ORDER BY id ASC`,
        [businessId]
    );

    res.status(200).json({
        queues: result.rows
    });
}
catch(error){
    console.error(error);

    res.status(500).json({
        message: "Failed to get queues."
    });
}  

});

app.get("/dashboard", authenticateToken, async(req, res)=> {
    try{
    const businessId = req.business.id;

    const totalStaffResult = await pool.query(
        `SELECT COUNT(*) AS total_staff
        FROM staff
        WHERE business_id = $1`,
        [businessId]
    );

    const availableStaffResult = await pool.query(
        `SELECT COUNT(*) AS available_staff
        FROM staff
        WHERE business_id = $1
        AND available = TRUE`,
        [businessId]
    );

    const busyStaffResult = await pool.query(
        `SELECT COUNT(*) AS busy_staff
        FROM staff
        WHERE business_id = $1
        AND available = FALSE`,
        [businessId]
    )

    const waitingCustomersResult = await pool.query(
        `SELECT COUNT (*) AS waiting_customers
        FROM queues
        WHERE business_id = $1
        AND status = 'waiting'`,
        [businessId]
    );

    const servingCustomersResult = await pool.query(
        `SELECT COUNT(*) AS serving_customers
        FROM queues
        WHERE business_id = $1
        AND status = 'serving'`,
        [businessId]
    );

    const completedCustomersResult = await pool.query(
        `SELECT COUNT(*) AS completed_customers
        FROM queues
        WHERE business_id = $1
        AND status = 'completed'`,
        [businessId]
    );

    const cancelledCustomersResult = await pool.query(
    `SELECT COUNT(*) AS cancelled_customers
     FROM queues
     WHERE business_id = $1
     AND status = 'cancelled'`,

    [businessId]
);

    res.status(200).json({
        totalStaff: Number(totalStaffResult.rows[0].total_staff),
        availableStaff: Number(availableStaffResult.rows[0].available_staff),
        waitingCustomers: Number(waitingCustomersResult.rows[0].waiting_customers),
        servingCustomers: Number(servingCustomersResult.rows[0].serving_customers),
        completedCustomers: Number(completedCustomersResult.rows[0].completed_customers),
        busyStaff: Number(busyStaffResult.rows[0].busy_staff),
        cancelledCustomers: Number(cancelledCustomersResult.rows[0].cancelled_customers),

    });

}catch(error){

    console.error(error);

    res.status(500).json({
        message: "Failed to get dashboard data."
    });

}
});

app.get("/join/:slug", async (req, res) => {
    try {
        const { slug } = req.params;

        const result = await pool.query(
            `SELECT id, business_name, location, slug, phone
             FROM businesses
             WHERE slug = $1`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Business not found."
            });
        }

        res.status(200).json({
            business: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to find business."
        });
    }
});

app.get("/join/:slug/queue/:ticket", async (req, res) =>{
    try{
        const {slug, ticket } = req.params;

        const result = await pool.query(
            `SELECT
            q.id,
            b.business_name,
            q.customer_name,
            q.phone,
            q.people,
            q.ticket,
            q.status
            FROM queues q
            JOIN businesses  b
            ON q.business_id = b.id
            WHERE b.slug = $1
            AND q.ticket = $2
            `,
            [slug, ticket]
        );

        if(result.rows.length === 0){
            return res.status(404).json({
                message: "Queue ticket not found."
            });
        }

        const queue = result.rows[0];

        const peopleAhead = await pool.query(
            `SELECT COUNT(*) AS count
            FROM queues
            WHERE business_id = (
                SELECT business_id
                FROM queues
                WHERE id = $1
                )
                AND id < $1
                AND status = 'waiting'`,
                [queue.id]
        );

        res.status(200).json({
            business: queue.business_name,
            customer: queue.customer_name,
            ticket: queue.ticket,
            status: queue.status,
            people: queue.people,
            people_ahead : Number(peopleAhead.rows[0].count)
        });
    }catch(error){
        console.error(error);

        res.status(500).json({
            message: "Failed to get queue status."
        });
    }
});



app.listen(PORT, ()=>{
    console.log(`Queueless server running on port ${PORT}`);
})