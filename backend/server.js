const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const pool = require("./db");

const app = express();
const PORT = 5000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));

// ================= HOME ROUTE =================
app.get("/", (req, res) => {
    res.send("Car Pooling Backend Running Successfully");
});

// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
    res.json({
        status: "Server running",
        port: PORT
    });
});

// ================= REGISTER USER =================
app.post("/register", async (req, res) => {
    let connection;

    try {
        const {
            name,
            email,
            password,
            role,
            phone,
            city,
            license,
            vehicle,
            insurance
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        connection = await pool.getConnection();

        // Check existing user
        const [existing] = await connection.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                error: "Email already registered"
            });
        }

        // Insert user
        const [result] = await connection.query(
            `INSERT INTO users
            (name, email, password, role, phone, city, license, vehicle, insurance, verified, verificationStatus, rides, savings, avatar, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                name,
                email,
                password,
                role || "rider",
                phone || "",
                city || "Hyderabad",
                license || "",
                vehicle || "",
                insurance || "",
                role === "driver" ? false : true,
                role === "driver" ? "pending" : "verified",
                0,
                0,
                name
                    ? name.split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase()
                    : "US"
            ]
        );

        res.json({
            success: true,
            message: "User registered successfully",
            userId: result.insertId
        });

    } catch (error) {
        console.error("Register Error:", error);

        res.status(500).json({
            error: "Registration failed"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ================= LOGIN USER =================
app.post("/login", async (req, res) => {
    let connection;

    try {
        const { email, password } = req.body;

        connection = await pool.getConnection();

        const [users] = await connection.query(
            "SELECT * FROM users WHERE email = ? AND password = ?",
            [email, password]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: "Invalid credentials"
            });
        }

        const user = users[0];

        res.json({
            success: true,
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            city: user.city,
            avatar: user.avatar,
            verified: user.verified,
            verificationStatus: user.verificationStatus
        });

    } catch (error) {
        console.error("Login Error:", error);

        res.status(500).json({
            error: "Login failed"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ================= DRIVER APPLICATION =================
// ================= VERIFY DRIVER =================
app.post("/verifyDriver", async (req, res) => {
    let connection;

    try {
        const {
            user_id,
            license,
            vehicle,
            insurance
        } = req.body;

        if (!user_id) {
            return res.status(400).json({
                error: "User ID required"
            });
        }

        connection = await pool.getConnection();

        await connection.query(
            `UPDATE users 
             SET verified = ?, 
                 verificationStatus = ?, 
                 license = ?, 
                 vehicle = ?, 
                 insurance = ?
             WHERE id = ?`,
            [
                true,
                "approved",
                license || "",
                vehicle || "",
                insurance || "",
                user_id
            ]
        );

        const [users] = await connection.query(
            "SELECT * FROM users WHERE id = ?",
            [user_id]
        );

        res.json({
            success: true,
            message: "Driver verified successfully",
            user: users[0]
        });

    } catch (error) {
        console.error("Verify Driver Error:", error);

        res.status(500).json({
            error: "Driver verification failed"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});
// ================= ADD RIDE =================
app.post("/addRide", async (req, res) => {
    let connection;

    try {
        const {
            driver_id,
            driver_name,
            source,
            destination,
            seats,
            price,
            travel_date,
            car_model,
            car_plate
        } = req.body;

        connection = await pool.getConnection();

        const [result] = await connection.query(
            `INSERT INTO rides
            (driver_id, driver_name, source, destination, seats, price, travel_date, car_model, car_plate, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                driver_id,
                driver_name,
                source,
                destination,
                seats,
                price,
                travel_date,
                car_model || "",
                car_plate || "",
                "active"
            ]
        );

        res.json({
            success: true,
            rideId: result.insertId
        });

    } catch (error) {
        console.error("Add Ride Error:", error);

        res.status(500).json({
            error: "Failed to add ride"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ================= GET RIDES =================
app.get("/getRides", async (req, res) => {
    let connection;

    try {
        connection = await pool.getConnection();

        const [rides] = await connection.query(
            "SELECT * FROM rides WHERE status = 'active' ORDER BY travel_date ASC"
        );

        res.json(rides);

    } catch (error) {
        console.error("Get Rides Error:", error);

        res.status(500).json({
            error: "Failed to fetch rides"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ================= BOOK RIDE =================
app.post("/bookRide", async (req, res) => {
    let connection;

    try {
        const {
            ride_id,
            rider_id,
            rider_name
        } = req.body;

        connection = await pool.getConnection();

        const [rides] = await connection.query(
            "SELECT * FROM rides WHERE id = ?",
            [ride_id]
        );

        if (rides.length === 0) {
            return res.status(404).json({
                error: "Ride not found"
            });
        }

        if (rides[0].seats <= 0) {
            return res.status(400).json({
                error: "No seats available"
            });
        }

        // Insert booking
        const [result] = await connection.query(
            `INSERT INTO bookings
            (ride_id, rider_id, rider_name, status, created_at)
            VALUES (?, ?, ?, ?, NOW())`,
            [
                ride_id,
                rider_id,
                rider_name,
                "confirmed"
            ]
        );

        // Reduce seats
        await connection.query(
            "UPDATE rides SET seats = seats - 1 WHERE id = ?",
            [ride_id]
        );

        res.json({
            success: true,
            bookingId: result.insertId
        });

    } catch (error) {
        console.error("Book Ride Error:", error);

        res.status(500).json({
            error: "Booking failed"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ================= MY BOOKINGS =================
app.get("/myBookings/:rider_id", async (req, res) => {
    let connection;

    try {
        connection = await pool.getConnection();

        const [bookings] = await connection.query(
            `SELECT b.*, r.source, r.destination, r.travel_date, r.price
            FROM bookings b
            JOIN rides r ON b.ride_id = r.id
            WHERE b.rider_id = ?`,
            [req.params.rider_id]
        );

        res.json(bookings);

    } catch (error) {
        console.error("Bookings Error:", error);

        res.status(500).json({
            error: "Failed to fetch bookings"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});
// ================= DRIVER RIDES =================
app.get("/myDriverRides/:driver_id", async (req, res) => {

    let connection;

    try {

        connection = await pool.getConnection();

        const [rides] = await connection.query(

            `SELECT 
                r.*,
                b.rider_name,
                b.status AS booking_status
             FROM rides r
             LEFT JOIN bookings b
             ON r.id = b.ride_id
             WHERE r.driver_id = ?`,

            [req.params.driver_id]
        );

        res.json(rides);

    } catch (error) {

        console.error("Driver Rides Error:", error);

        res.status(500).json({
            error: "Failed to fetch driver rides"
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
});

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        error: "Internal Server Error"
    });
});
app.post("/verifyDriver", async (req, res) => {
    let connection;

    try {
        const { user_id, license, vehicle, insurance } = req.body;

        connection = await pool.getConnection();

        await connection.query(
            `UPDATE users 
             SET verified = ?, verificationStatus = ?, 
                 license = ?, vehicle = ?, insurance = ?
             WHERE id = ?`,
            [true, "approved", license, vehicle, insurance, user_id]
        );

        res.json({
            success: true,
            message: "Driver verified successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Verification failed"
        });

    } finally {
        if (connection) connection.release();
    }
});
// ================= START SERVER =================
app.listen(PORT, () => {
    console.log("✓ Connected to MySQL Database");
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ API endpoint: http://localhost:${PORT}`);
});
