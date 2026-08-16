const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

// Get notifications for the logged-in user
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                type,
                title,
                message,
                is_read,
                created_at
             FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.userId]
        );

        res.json({
            success: true,
            notifications: result.rows
        });

    } catch (error) {
        console.error("Error fetching notifications:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch notifications"
        });
    }
});

module.exports = router;