const express = require("express");
const zod = require("zod");
const jwt = require("jsonwebtoken");
const { User } = require("../../Models/userModel");
const { JWT_SECRET } = require("../../config");
const { authMiddleware } = require("../../Middlewares/authMw");

const router = express.Router();

// Zod Schemas
const signUpBody = zod.object({
    username: zod.string().email(),
    password: zod.string().min(6),
    firstName: zod.string().min(2).max(50),
    lastName: zod.string().min(2).max(50),
});

const signInBody = zod.object({
    username: zod.string().email(),
    password: zod.string(),
});

const updateBody = zod.object({
    password: zod.string().min(6),
    newPassword: zod.string().min(6)
});

// Routes
router.post("/signup", async (req, res) => {
    const body = req.body;
    const { success, error } = signUpBody.safeParse(body);

    if (!success) {
        return res.status(400).json({ message: "Incorrect inputs", errors: error.errors });
    }

    const existingUser = await User.findOne({ username: body.username });
    if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
    }

    const newUser = new User({
        username: body.username,
        firstName: body.firstName,
        lastName: body.lastName,
    });

    const hashedPassword = await newUser.createHash(body.password);
    newUser.hashedPassword = hashedPassword;
    await newUser.save();

    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({ message: "User created successfully", token });
});

router.post("/signin", async (req, res) => {
    const { success, error } = signInBody.safeParse(req.body);
    if (!success) {
        return res.status(400).json({ message: "Invalid inputs", errors: error.errors });
    }

    const user = await User.findOne({ username: req.body.username });
    if (user && (await user.validatePassword(req.body.password))) {
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
        return res.json({ 
            token : token,
            message: "User Logged in Successful." 
        });
    }

    res.status(400).json({ message: "Invalid username or password" });
});

router.put("/reset-pw", authMiddleware, async (req, res) => {
    const { success, error } = updateBody.safeParse(req.body);
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
            return res.status(400).json({ message: "Incorrect password." });
        }

        user.hashedPassword = await user.createHash(newPassword);
        await user.save();

        return res.status(200).json({ message: "Password updated successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Internal server error" });
    }
});

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
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            _id: user._id,
        })),
    });
});

module.exports = router;
