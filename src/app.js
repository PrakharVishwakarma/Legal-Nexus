// /app.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const dbConnect = require("./dbConnect");
const ExpressError = require("./utils/ExpressError"); 

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
dbConnect();

// Routes
const mainRouter = require("./routes/index");
app.use("/api/v1", mainRouter);

// Handle 404 (Page Not Found)
app.all("*", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found"));
});

// Centralized Error Handler (MUST be after all routes)
app.use((err, req, res, next) => {
    const { statusCode = 500, message = "Internal Server Error" } = err;
    console.error("🔥 Error:", err);
    res.status(statusCode).json({ message });
});

// Start Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server running on port: ${port}`);
});
