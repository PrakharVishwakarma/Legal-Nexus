// src/dbConnect.js
 
const mongoose = require("mongoose");

const dbConnect = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Database connected successfully.");
    } catch (err) {
        console.error("Database connection error:", err);
        process.exit(1); // Exit on database connection error
    }
};

module.exports = dbConnect;
