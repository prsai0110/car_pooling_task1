const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "Rahinisai@123",
    database: "carpooling",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then((connection) => {
        console.log("✓ Connected to MySQL Database");
        connection.release();
    })
    .catch((err) => {
        console.error("✗ Database connection failed:", err.message);
    });

module.exports = pool;