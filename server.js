const express = require("express");
const cors = require("cors");

const pool = require("./config/database");
const usersRoutes = require("./routes/users");
const bagsRoutes = require("./routes/bags");
const qrCodesRoutes = require("./routes/qrCodes");
const notificationsRoutes = require("./routes/notifications");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/users", usersRoutes);
app.use("/api/bags", bagsRoutes);
app.use("/api/qr-codes", qrCodesRoutes);
app.use("/api/notifications", notificationsRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "SafarTrack API is running 🚀"
    });
});

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS database_time");

        res.json({
            success: true,
            message: "PostgreSQL connection works! 🚀",
            database_time: result.rows[0].database_time
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`SafarTrack API running on http://localhost:${PORT}`);
});