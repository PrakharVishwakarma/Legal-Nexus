require("dotenv").config();

module.exports = {
    JWT_SECRET: process.env.JWT_SECRET,
    MONGODB_URI: process.env.MONGODB_URI,
    OTP_EXPIRY: parseInt(process.env.OTP_EXPIRY, 10),  // Parse as integer
};
