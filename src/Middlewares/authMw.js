// src/Middlewares/authMw.js

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");
const { User } = require("../Models/userModel");

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // console.log("Authorization Header: ", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({
      message: "Authorization header missing or invalid",
    });
  }

  const token = authHeader.split(" ")[1];
  // console.log("Token: ", token);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userMongoId);
    if (!user) {
      return res
        .status(401)
        .json({ message: "User not found due to wrong jwt token" });
    }
    if (!user.walletAddress) {
      return res
        .status(401)
        .json({
          message: "User's wallet not found. Plase Connect to metamask.",
        });
    }

    req.userWalletAddress = user.walletAddress;
    req.userMongoId = user._id;
    req.userRole = user.role;
    
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired." });
    }
    console.error("Authentication error:", err);
    return res.status(403).json({ message: "Failed to authenticate token", error: err.message });
  }
};

module.exports = { authMiddleware };
