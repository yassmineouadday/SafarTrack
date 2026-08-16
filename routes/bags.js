const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

// GET all bags belonging to the logged-in user
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, owner_id, name, status, created_at
             FROM bags
             WHERE owner_id = $1
             ORDER BY created_at DESC`,
            [req.user.userId]
        );

        res.json({
            success: true,
            bags: result.rows
        });

    } catch (error) {
        console.error("Error fetching bags:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch bags"
        });
    }
});

// CREATE a new bag
router.post("/", authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Bag name is required"
            });
        }

        const result = await pool.query(
            `INSERT INTO bags (owner_id, name, status)
             VALUES ($1, $2, $3)
             RETURNING id, owner_id, name, status, created_at`,
            [req.user.userId, name, "active"]
        );

        res.status(201).json({
            success: true,
            message: "Bag created successfully",
            bag: result.rows[0]
        });

    } catch (error) {
        console.error("Error creating bag:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create bag"
        });
    }
});

module.exports = router;