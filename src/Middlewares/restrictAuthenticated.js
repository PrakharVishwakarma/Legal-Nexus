// /Middlewares/restrictAuthenticated.js
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");

const restrictAuthenticated = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Check if token is provided and valid
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];

        try {
            // Verify token
            jwt.verify(token, JWT_SECRET);
            // If token is valid, block access
            return res.status(403).json({
                message: "Access denied for authenticated users. You are already logged in.",
            });
        } catch (err) {
            // If token is expired or invalid, proceed to next middleware
            if (err.name === "TokenExpiredError") {
                return next();  // Expired token allows access to /signup and /verify-otp
            }
        }
    }

    // No token present, proceed with the request
    next();
};

module.exports = { restrictAuthenticated };
