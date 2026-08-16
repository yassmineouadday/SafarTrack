const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const {
    registerUser,
    loginUser
} = require("../controllers/usersController");

// GET all users
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name, email, phone, created_at FROM users ORDER BY id"
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching users:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch users"
        });
    }
});

// REGISTER
router.post("/register", registerUser);
router.post("/login", loginUser);

module.exports = router;