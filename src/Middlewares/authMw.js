// src/Middlewares/authMw.js

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({
      message: "Authorization header missing or invalid",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userMongoId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired." });
    }
    return res.status(403).json({ message: "Failed to authenticate token" });
  }
};

module.exports = { authMiddleware };
