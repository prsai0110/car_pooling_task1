const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const pool = require("./db");

const app = express();
const PORT = 5000;

// MIDDLEWARE
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// HEALTH CHECK
app.get("/health", (req, res) => {
    res.json({ status: "Server running", port: PORT });
});

// ============ USER ENDPOINTS ============

// REGISTER USER
app.post("/register", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const connection = await pool.getConnection();
        
        // Check if user exists
        const [existing] = await connection.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({ error: "Email already registered" });
        }

        // Insert new user
        const [result] = await connection.query(
            "INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, NOW())",
            [name, email, password, role || "rider"]
        );

        connection.release();
        res.json({ 
            success: true, 
            message: "User registered successfully",
            userId: result.insertId 
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// LOGIN USER
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const connection = await pool.getConnection();
        const [users] = await connection.query(
            "SELECT id, name, email, role FROM users WHERE email = ? AND password = ?",
            [email, password]
        );
        connection.release();

        if (users.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = users[0];
        res.json({
            success: true,
            message: "Login successful",
            userId: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});

// GET USER BY ID
app.get("/user/:id", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [users] = await connection.query(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            [req.params.id]
        );
        connection.release();

        if (users.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(users[0]);
    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// ============ RIDE ENDPOINTS ============

// POST A NEW RIDE
app.post("/addRide", async (req, res) => {
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

        if (!driver_id || !source || !destination || !seats || !price || !travel_date) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const connection = await pool.getConnection();
        const [result] = await connection.query(
            `INSERT INTO rides 
            (driver_id, driver_name, source, destination, seats, price, travel_date, car_model, car_plate, status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [driver_id, driver_name, source, destination, seats, price, travel_date, car_model || null, car_plate || null, "active"]
        );

        connection.release();
        res.json({
            success: true,
            message: "Ride posted successfully",
            rideId: result.insertId
        });
    } catch (error) {
        console.error("Add ride error:", error);
        res.status(500).json({ error: "Failed to post ride" });
    }
});

// GET ALL ACTIVE RIDES
app.get("/getRides", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rides] = await connection.query(
            "SELECT * FROM rides WHERE status = 'active' ORDER BY travel_date ASC"
        );
        connection.release();

        res.json(rides);
    } catch (error) {
        console.error("Get rides error:", error);
        res.status(500).json({ error: "Failed to fetch rides" });
    }
});

// SEARCH RIDES BY SOURCE AND DESTINATION
app.get("/searchRides", async (req, res) => {
    try {
        const { source, destination, date } = req.query;

        let query = "SELECT * FROM rides WHERE status = 'active'";
        const params = [];

        if (source) {
            query += " AND LOWER(source) LIKE LOWER(?)";
            params.push(`%${source}%`);
        }

        if (destination) {
            query += " AND LOWER(destination) LIKE LOWER(?)";
            params.push(`%${destination}%`);
        }

        if (date) {
            query += " AND DATE(travel_date) = ?";
            params.push(date);
        }

        query += " ORDER BY travel_date ASC";

        const connection = await pool.getConnection();
        const [rides] = await connection.query(query, params);
        connection.release();

        res.json(rides);
    } catch (error) {
        console.error("Search rides error:", error);
        res.status(500).json({ error: "Failed to search rides" });
    }
});

// GET RIDE BY ID
app.get("/ride/:id", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rides] = await connection.query(
            "SELECT * FROM rides WHERE id = ?",
            [req.params.id]
        );
        connection.release();

        if (rides.length === 0) {
            return res.status(404).json({ error: "Ride not found" });
        }

        res.json(rides[0]);
    } catch (error) {
        console.error("Get ride error:", error);
        res.status(500).json({ error: "Failed to fetch ride" });
    }
});

// GET USER'S RIDES (Driver's Posted Rides)
app.get("/myRides/:driver_id", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rides] = await connection.query(
            "SELECT * FROM rides WHERE driver_id = ? ORDER BY travel_date DESC",
            [req.params.driver_id]
        );
        connection.release();

        res.json(rides);
    } catch (error) {
        console.error("Get my rides error:", error);
        res.status(500).json({ error: "Failed to fetch your rides" });
    }
});

// ============ BOOKING ENDPOINTS ============

// BOOK A RIDE
app.post("/bookRide", async (req, res) => {
    try {
        const { ride_id, rider_id, rider_name } = req.body;

        if (!ride_id || !rider_id || !rider_name) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const connection = await pool.getConnection();

        // Check if ride exists and has available seats
        const [rides] = await connection.query(
            "SELECT seats FROM rides WHERE id = ? AND status = 'active'",
            [ride_id]
        );

        if (rides.length === 0) {
            connection.release();
            return res.status(404).json({ error: "Ride not found or inactive" });
        }

        if (rides[0].seats <= 0) {
            connection.release();
            return res.status(400).json({ error: "No seats available" });
        }

        // Check if already booked
        const [existing] = await connection.query(
            "SELECT id FROM bookings WHERE ride_id = ? AND rider_id = ?",
            [ride_id, rider_id]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({ error: "Already booked this ride" });
        }

        // Create booking
        const [result] = await connection.query(
            "INSERT INTO bookings (ride_id, rider_id, rider_name, status, created_at) VALUES (?, ?, ?, ?, NOW())",
            [ride_id, rider_id, rider_name, "confirmed"]
        );

        // Update available seats
        await connection.query(
            "UPDATE rides SET seats = seats - 1 WHERE id = ?",
            [ride_id]
        );

        connection.release();
        res.json({
            success: true,
            message: "Ride booked successfully",
            bookingId: result.insertId
        });
    } catch (error) {
        console.error("Book ride error:", error);
        res.status(500).json({ error: "Failed to book ride" });
    }
});

// GET BOOKINGS FOR A RIDER
app.get("/myBookings/:rider_id", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [bookings] = await connection.query(
            `SELECT b.*, r.source, r.destination, r.travel_date, r.price, r.driver_name, r.car_model 
            FROM bookings b 
            JOIN rides r ON b.ride_id = r.id 
            WHERE b.rider_id = ? 
            ORDER BY r.travel_date DESC`,
            [req.params.rider_id]
        );
        connection.release();

        res.json(bookings);
    } catch (error) {
        console.error("Get my bookings error:", error);
        res.status(500).json({ error: "Failed to fetch bookings" });
    }
});

// GET BOOKINGS FOR A RIDE (Driver's View)
app.get("/rideBookings/:ride_id", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [bookings] = await connection.query(
            "SELECT * FROM bookings WHERE ride_id = ? ORDER BY created_at DESC",
            [req.params.ride_id]
        );
        connection.release();

        res.json(bookings);
    } catch (error) {
        console.error("Get ride bookings error:", error);
        res.status(500).json({ error: "Failed to fetch ride bookings" });
    }
});

// CANCEL BOOKING
app.post("/cancelBooking", async (req, res) => {
    try {
        const { booking_id, ride_id } = req.body;

        const connection = await pool.getConnection();

        // Update booking status
        await connection.query(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
            [booking_id]
        );

        // Return seat to ride
        await connection.query(
            "UPDATE rides SET seats = seats + 1 WHERE id = ?",
            [ride_id]
        );

        connection.release();
        res.json({
            success: true,
            message: "Booking cancelled successfully"
        });
    } catch (error) {
        console.error("Cancel booking error:", error);
        res.status(500).json({ error: "Failed to cancel booking" });
    }
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
});

// START SERVER
app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ API endpoint: http://localhost:${PORT}`);
});