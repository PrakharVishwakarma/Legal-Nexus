// /routes/User/user.js

const express = require("express");
const zod = require("zod");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User, roles } = require("../../Models/userModel");
const { Employee } = require("../../Models/employeeModel");
const { JWT_SECRET, OTP_EXPIRY } = require("../../config");
const { generateOTP, sendOTP } = require("../../utils/otpService");
const { authMiddleware } = require("../../Middlewares/authMw");
const { restrictAuthenticated } = require("../../Middlewares/restrictAuthenticated");

const router = express.Router();

// Zod Schemas
const signUpBody = zod.object({
    role: zod.enum(roles),
    firstName: zod.string().min(2).max(50),
    lastName: zod.string().min(2).max(50),
    aadharNumber: zod.string().length(12),
    phoneNumber: zod.string(),
    userId: zod.string().optional(),
    employeeId: zod.string().optional(),
    password: zod.string().min(6),
});

const otpBody = zod.object({
    phoneNumber: zod.string(),
    otp: zod.string().length(6),
});

const signInBody = zod.object({
    role: zod.enum(roles),
    identifier: zod.string(),
    password: zod.string(),
});

const updatePasswordBody = zod.object({
    password: zod.string().min(6),
    newPassword: zod.string().min(6),
});

router.post("/signup", restrictAuthenticated, async (req, res) => {
    const { success, error } = signUpBody.safeParse(req.body);

    if (!success) {
        return res.status(400).json({ message: "Incorrect inputs", errors: error.errors });
    }

    const { role, firstName, lastName, aadharNumber, phoneNumber, userId, employeeId, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ aadharNumber }, { phoneNumber }],
        });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Employee verification for restricted roles
        if (["Judge", "Lawyer", "Police"].includes(role)) {
            const employee = await Employee.findOne({ employeeId, role, verificationStatus: "Verified" });
            if (!employee) {
                return res.status(400).json({ message: "Employee ID not found or not verified" });
            }
        }

        // Generate OTP and set expiry
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + OTP_EXPIRY);

        // Create new user object with hashed password and OTP
        const newUser = new User({
            role,
            firstName,
            lastName,
            aadharNumber,
            phoneNumber,
            userId: role === "Civilian" ? userId : undefined,
            employeeId: ["Judge", "Lawyer", "Police"].includes(role) ? employeeId : undefined,
            hashedPassword: await bcrypt.hash(password, 10),
            otp: await bcrypt.hash(otp, 10),  // Hash OTP before saving
            otpExpiry,
        });

        // Save user to the database
        await newUser.save();

        // Send OTP to user's phone number
        const otpSent = await sendOTP(phoneNumber, otp);
        if (!otpSent) {
            return res.status(500).json({ message: "Failed to send OTP. Please try again." });
        }

        res.json({ message: "OTP sent to the registered phone number." });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// OTP Verification Route
router.post("/verify-otp", restrictAuthenticated, async (req, res) => {
    const { success, error } = otpBody.safeParse(req.body);

    if (!success) {
        return res.status(400).json({ message: "Invalid inputs", errors: error.errors });
    }

    const { phoneNumber, otp } = req.body;
    const user = await User.findOne({ phoneNumber });

    if (!user) {
        return res.status(404).json({ message: "User not found." });
    }

    if (user.otpExpiry < new Date()) {
        return res.status(400).json({ message: "OTP expired. Request a new OTP." });
    }

    const isValidOtp = await bcrypt.compare(otp, user.otp);
    if (!isValidOtp) {
        return res.status(400).json({ message: "Invalid OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: "User successfully verified" });
});

// Login Route for All Roles
router.post("/signin", async (req, res) => {
    const { success, error } = signInBody.safeParse(req.body);

    if (!success) {
        return res.status(400).json({ message: "Invalid inputs", errors: error.errors });
    }

    const { role, identifier, password } = req.body;
    const query = role === "Civilian" || role === "Admin" ? { userId: identifier } : { employeeId: identifier };

    const user = await User.findOne({ ...query, role });
    
    if (!user) { 
        return res.status(400).json({ message: "Invalid user" });
    }

    if (!user.isVerified) { 
        return res.status(400).json({ 
            message: "User is not verified with OTP. Please complete OTP verification to activate your account." 
        });
    }

    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) { 
        return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
});


/*
router.post("/signout", authMiddleware, (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];

        return res.status(200).json({ message: "Logged out successfully." });
    }
    res.status(400).json({ message: "No token provided." });
});
*/


// Password Reset Route
router.put("/reset-pw", authMiddleware, async (req, res) => {
    const { success, error } = updatePasswordBody.safeParse(req.body);

    if (!success) {
        return res.status(400).json({ message: "Invalid inputs", errors: error.errors });
    }

    const { password, newPassword } = req.body;

    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const isPasswordValid = await user.validatePassword(password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Incorrect current password." });
        }

        user.hashedPassword = await user.createHash(newPassword);
        await user.save();

        res.status(200).json({ message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json({ message: "Internal server error" });
    }
});

// Bulk User Search
router.get("/bulk", async (req, res) => {
    const filter = req.query.filter || "";

    const users = await User.find({
        $or: [
            { firstName: { $regex: filter, $options: "i" } },
            { lastName: { $regex: filter, $options: "i" } },
        ],
    });

    res.json({
        users: users.map((user) => ({
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            role: user.role,
            _id: user._id,
        })),
    });
});

module.exports = router;
