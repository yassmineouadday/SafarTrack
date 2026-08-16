const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

// Create a QR code for one of the logged-in user's bags
router.post("/:bagId", authMiddleware, async (req, res) => {
    try {
        const { bagId } = req.params;

        // Check that the bag belongs to the logged-in user
        const bagResult = await pool.query(
            `SELECT id, name
             FROM bags
             WHERE id = $1 AND owner_id = $2`,
            [bagId, req.user.userId]
        );

        if (bagResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Bag not found"
            });
        }

        // Generate UUID
        const uuid = crypto.randomUUID();

        // Store QR code
        const result = await pool.query(
            `INSERT INTO qr_codes (bag_id, uuid)
             VALUES ($1, $2)
             RETURNING id, bag_id, uuid, created_at`,
            [bagId, uuid]
        );

        res.status(201).json({
            success: true,
            message: "QR code created successfully",
            qr_code: result.rows[0]
        });

    } catch (error) {
        console.error("Error creating QR code:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create QR code"
        });
    }
});

// Get QR codes belonging to one of the user's bags
router.get("/:bagId", authMiddleware, async (req, res) => {
    try {
        const { bagId } = req.params;

        const result = await pool.query(
            `SELECT q.id, q.bag_id, q.uuid, q.created_at
             FROM qr_codes q
             JOIN bags b ON q.bag_id = b.id
             WHERE q.bag_id = $1
             AND b.owner_id = $2
             ORDER BY q.created_at DESC`,
            [bagId, req.user.userId]
        );

        res.json({
            success: true,
            qr_codes: result.rows
        });

    } catch (error) {
        console.error("Error fetching QR codes:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch QR codes"
        });
    }
});
// PUBLIC: Get bag information using the QR UUID
router.get("/public/:uuid", async (req, res) => {
    try {
        const { uuid } = req.params;

        const result = await pool.query(
            `SELECT
                b.id AS bag_id,
                b.name AS bag_name,
                b.status,
                q.uuid
             FROM qr_codes q
             JOIN bags b ON q.bag_id = b.id
             WHERE q.uuid = $1`,
            [uuid]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "QR code not found"
            });
        }

        res.json({
            success: true,
            bag: result.rows[0]
        });

    } catch (error) {
        console.error("Error finding QR code:", error);

        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
router.post("/public/:uuid/message", async (req, res) => {
    try {
        const { uuid } = req.params;
        const { sender_name, sender_email, message } = req.body;

        if (!sender_name || !sender_email || !message) {
            return res.status(400).json({
                success: false,
                message: "Name, email and message are required"
            });
        }

        // Find QR + bag + owner
        const qrResult = await pool.query(
            `SELECT
                q.id AS qr_code_id,
                b.id AS bag_id,
                b.name AS bag_name,
                b.owner_id
             FROM qr_codes q
             JOIN bags b ON q.bag_id = b.id
             WHERE q.uuid = $1`,
            [uuid]
        );

        if (qrResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "QR code not found"
            });
        }

        const qr = qrResult.rows[0];

        // Save finder message
        const messageResult = await pool.query(
            `INSERT INTO messages
             (qr_code_id, sender_name, sender_email, message)
             VALUES ($1, $2, $3, $4)
             RETURNING id, qr_code_id, sender_name, sender_email, message, created_at`,
            [
                qr.qr_code_id,
                sender_name,
                sender_email,
                message
            ]
        );

        // Create notification for bag owner
        await pool.query(
            `INSERT INTO notifications
             (user_id, type, title, message, is_read)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                qr.owner_id,
                "finder_message",
                "Someone found your bag",
                `${sender_name} sent you a message about "${qr.bag_name}".`,
                false
            ]
        );

        res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: messageResult.rows[0]
        });

    } catch (error) {
        console.error("Error sending finder message:", error);

        res.status(500).json({
            success: false,
            message: "Unable to send message"
        });
    }
});
// PUBLIC: Record a QR scan
router.post("/public/:uuid/scan", async (req, res) => {
    try {
        const { uuid } = req.params;
        const { latitude, longitude } = req.body;

        // Find QR code
        const qrResult = await pool.query(
            `SELECT id
             FROM qr_codes
             WHERE uuid = $1`,
            [uuid]
        );

        if (qrResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "QR code not found"
            });
        }

        const qrCodeId = qrResult.rows[0].id;

        // Get scanner IP
        const scannerIp =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            null;

        // Determine location source
        let locationSource = "none";

        if (latitude !== undefined && longitude !== undefined) {
            locationSource = "gps";
        }

        // Save scan
        const result = await pool.query(
            `INSERT INTO scans
             (qr_code_id, latitude, longitude, scanner_ip, location_source)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, qr_code_id, latitude, longitude,
                       scanner_ip, location_source, scanned_at`,
            [
                qrCodeId,
                latitude ?? null,
                longitude ?? null,
                scannerIp,
                locationSource
            ]
        );

        res.status(201).json({
            success: true,
            message: "QR scan recorded",
            scan: result.rows[0]
        });

    } catch (error) {
        console.error("Error recording QR scan:", error);

        res.status(500).json({
            success: false,
            message: "Unable to record scan"
        });
    }
});
// OWNER: Get the latest scan for one of the user's bags
router.get("/bag/:bagId/latest-scan", authMiddleware, async (req, res) => {
    try {
        const { bagId } = req.params;

        const result = await pool.query(
            `SELECT
                s.id,
                s.qr_code_id,
                s.latitude,
                s.longitude,
                s.location_source,
                s.scanned_at
             FROM scans s
             JOIN qr_codes q ON s.qr_code_id = q.id
             JOIN bags b ON q.bag_id = b.id
             WHERE b.id = $1
             AND b.owner_id = $2
             ORDER BY s.scanned_at DESC
             LIMIT 1`,
            [bagId, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No scans found for this bag"
            });
        }

        res.json({
            success: true,
            scan: result.rows[0]
        });

    } catch (error) {
        console.error("Error fetching latest scan:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch latest scan"
        });
    }
});
module.exports = router;    