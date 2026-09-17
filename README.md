# QueueLess Backend

QueueLess is a digital queue management system that allows customers to join business queues remotely and allows businesses to manage their customers efficiently.

The system is designed to work across different industries such as:

- 🏥 Clinics
- 💈 Barbershops
- 🏦 Banks
- 🏛️ Government offices
- 🍽️ Restaurants
- 🎓 Universities
- And other businesses that use physical queues

---

## 🚀 Features

### Business

- Business registration
- Business login
- Secure password hashing
- JWT authentication
- Business-specific dashboard
- Add staff members
- View staff members
- View queue
- Serve the next customer
- Complete customers
- Cancel waiting customers

### Customer

- Access a business using its public slug
- Join a queue
- Receive a queue ticket
- View queue status
- See how many people are ahead
- Track whether the customer is waiting, serving, completed, or cancelled

---

## 🛠️ Technologies Used

- Node.js
- Express.js
- PostgreSQL
- PostgreSQL `pg` driver
- bcrypt
- JSON Web Token (JWT)
- dotenv
- Thunder Client for API testing

---

## 📁 Project Structure

```text
backend/
│
├── server.js
├── package.json
├── package-lock.json
├── .env
├── .gitignore
└── README.md