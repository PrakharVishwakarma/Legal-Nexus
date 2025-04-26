// src/routes/User/user.js

const express = require("express");
const zod = require("zod");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User, roles } = require("../../Models/userModel");
const { Employee } = require("../../Models/employeeModel");
const { JWT_SECRET, OTP_EXPIRY } = require("../../config");
const { generateOTP, sendOTP } = require("../../utils/otpService");
const { authMiddleware } = require("../../Middlewares/authMw");
const {
  restrictAuthenticated,
} = require("../../Middlewares/restrictAuthenticated");

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
router.post("/signup", restrictAuthenticated, async (req, res) => {
  const { success, error } = signUpBody.safeParse(req.body);

  if (!success) {
    return res
      .status(400)
      .json({ message: "Incorrect inputs", errors: error.errors });
  }

  const {
    role,
    firstName,
    lastName,
    aadharNumber,
    phoneNumber,
    userId,
    employeeId,
    password,
  } = req.body;

  try {
    const existingUser = await User.findOne({
      $or: [{ aadharNumber }, { phoneNumber }],
    });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    if (["Judge", "Lawyer", "Police"].includes(role)) {
      const employee = await Employee.findOne({
        employeeId,
        role,
        verificationStatus: "Verified",
      });
      if (!employee) {
        return res
          .status(400)
          .json({ message: "Employee ID not found or not verified" });
      }
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY);

    const newUser = new User({
      role,
      firstName,
      lastName,
      aadharNumber,
      phoneNumber,
      userId: role === "Civilian" ? userId : undefined,
      employeeId: ["Judge", "Lawyer", "Police"].includes(role)
        ? employeeId
        : undefined,
      hashedPassword: await bcrypt.hash(password, 10),
      otp: await bcrypt.hash(otp, 10),
      otpExpiry,
    });

    await newUser.save();

    const otpSent = await sendOTP(phoneNumber, otp);
    if (!otpSent) {
      return res
        .status(500)
        .json({ message: "Failed to send OTP. Please try again." });
    }

    res.json({ message: "OTP sent to the registered phone number." });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
/*
Testing : POST api/v1/user/signup
Request -
Body : 
  {
    "role": "Civilian",
    "firstName": "John",
    "lastName": "Doe",
    "aadharNumber": "123456789012",
    "phoneNumber": "+918305394297",
    "userId": "johnDoe01",
    "password": "@91Jdln75"
  }

Response -
200 OK

{
  "message": "OTP sent to the registered phone number."
}
*/

// OTP Verification Route
const otpBody = zod.object({
  phoneNumber: zod.string(),
  otp: zod.string().length(6),
});
router.post("/verify-otp", restrictAuthenticated, async (req, res) => {
  const { success, error } = otpBody.safeParse(req.body);

  if (!success) {
    return res
      .status(400)
      .json({ message: "Invalid inputs", errors: error.errors });
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
/*
Testing : POST api/v1/user/verify-otp
Request -
Body :
  {
    "phoneNumber" : "+918305394297",
    "otp" : "556063"    
  }

Response -
200 OK

{
  "message": "User successfully verified"
}
*/

// Login Route for All Roles
const signInBody = zod.object({
  role: zod.enum(roles),
  identifier: zod.string(),
  password: zod.string(),
});
router.post("/signin", async (req, res) => {
  const { success, error } = signInBody.safeParse(req.body);

  if (!success) {
    return res
      .status(400)
      .json({ message: "Invalid inputs", errors: error.errors });
  }

  const { role, identifier, password } = req.body;
  const query =
    role === "Civilian" || role === "Admin"
      ? { userId: identifier }
      : { employeeId: identifier };

  const user = await User.findOne({ ...query, role });

  if (!user) {
    return res.status(400).json({ message: "Invalid user" });
  }

  if (!user.isVerified) {
    return res.status(400).json({
      message:
        "User is not verified with OTP. Please complete OTP verification to activate your account.",
    });
  }

  const isPasswordValid = await user.validatePassword(password);
  if (!isPasswordValid) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userMongoId: user._id, role: user.role },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
  res.json({
    message: "User Successfully logged in",
    token,
  });
});
/*
Testing : POST api/v1/user/signup
Request -
Body :  
  {
    "role" : "Civilian",
    "identifier" : "johnDoe01",
    "password" : "@91Jdln75"
  }

Response - 
200 OK
{
  "message": "User Successfully logged in",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyTW9uZ29JZCI6IjY4MDllNWE3YzhkMWJhNmJiOWQwMWM1NSIsInJvbGUiOiJDaXZpbGlhbiIsImlhdCI6MTc0NTQ4MDYyMSwiZXhwIjoxNzQ2MDg1NDIxfQ.Y7x7E3K_g7r0QmMkuccXdLoPbXukziczh4NlhnqEURk"
}

*/

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
const updatePasswordBody = zod.object({
  password: zod.string().min(6),
  newPassword: zod.string().min(6),
});
router.put("/reset-pw", authMiddleware, async (req, res) => {
  const { success, error } = updatePasswordBody.safeParse(req.body);

  if (!success) {
    return res
      .status(400)
      .json({ message: "Invalid inputs", errors: error.errors });
  }

  const { password, newPassword } = req.body;

  try {
    const user = await User.findById(req.userMongoId);
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

// Reset password using otp if registered user has forgotten
const requestResetSchema = zod.object({
  phoneNumber: zod
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
});
router.post("/forgot-password/request-reset", async (req, res) => {
  const { success, error } = requestResetSchema.safeParse(req.body);

  if (!success) {
    return res
      .status(400)
      .json({ message: "Invalid input", errors: error.errors });
  }

  const { phoneNumber } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(200).json({
        message: "If this phone number exists, a reset code has been sent.",
      });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 120 * 1000);

    user.resetOtp = await bcrypt.hash(otp, 10);
    user.resetOtpExpiry = otpExpiry;
    await user.save();

    const otpSent = await sendOTP(phoneNumber, otp);
    if (!otpSent) {
      return res
        .status(500)
        .json({ message: "Failed to send reset code. Please try again." });
    }

    res
      .status(200)
      .json({ message: "Reset code sent to the registered phone number." });
  } catch (error) {
    console.error("Error during password reset request:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

const resetPasswordSchema = zod.object({
  phoneNumber: zod.string(),
  resetCode: zod.string().length(6, "Reset code must be 6 digits"),
  newPassword: zod
    .string()
    .min(6, "Password must be at least 6 characters long"),
});
router.post("/forgot-password/reset", async (req, res) => {
  const { success, error } = resetPasswordSchema.safeParse(req.body);

  if (!success) {
    return res
      .status(400)
      .json({ message: "Invalid input", errors: error.errors });
  }

  const { phoneNumber, resetCode, newPassword } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid reset code or phone number." });
    }

    if (user.resetOtpExpiry < new Date()) {
      return res
        .status(400)
        .json({ message: "Reset code has expired. Please request a new one." });
    }

    const isOtpValid = await bcrypt.compare(resetCode, user.resetOtp);
    if (!isOtpValid) {
      return res.status(400).json({ message: "Invalid reset code." });
    }

    user.hashedPassword = await user.createHash(newPassword);
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;
    await user.save();

    res.status(200).json({
      message:
        "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Error during password reset:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userMongoId).select(
      "firstName lastName role phoneNumber userId employeeId aadharNumber isVerified walletAddress"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const userData = user.toObject();

    if (userData.aadharNumber) {
      userData.aadharNumber = userData.aadharNumber.replace(
        /^(\d{4})\d{4}(\d{4})$/,
        "$1****$2"
      );
    }

    return res.status(200).json(userData);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});
/*
Testing : GET api/v1/user/me
Request -
Body :  

Authorization: Bearer <token>

Response - 
200 OK

{
  "_id": "6809e5a7c8d1ba6bb9d01c55",
  "role": "Civilian",
  "firstName": "John",
  "lastName": "Doe",
  "aadharNumber": "1234****9012",
  "phoneNumber": "+918305394297",
  "userId": "johnDoe01",
  "isVerified": true,
  "walletAddress": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9"
}
*/

// PATCH /api/v1/user/update-wallet
const updateWalletSchema = zod.object({
  walletAddress: zod.string().startsWith("0x").length(42),
});

router.patch("/update-wallet", async (req, res) => {
  const parsedData = updateWalletSchema.safeParse(req.body);

  if (!parsedData.success) {
    return res.status(400).json({
      message: "Invalid wallet address format.",
      errors: parsedData.error.errors,
    });
  }

  const { walletAddress } = parsedData.data;

  try {
    // Extract and verify JWT manually
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(403)
        .json({ message: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userMongoId = decoded.userMongoId;

    // Check if wallet is already used by someone else
    const existing = await User.findOne({
      walletAddress: walletAddress.toLowerCase(),
      _id: { $ne: userMongoId },
    });

    if (existing) {
      return res.status(409).json({
        message: "This wallet address is already linked to another account.",
      });
    }

    // Save wallet address in lowercase format
    const user = await User.findByIdAndUpdate(
      userMongoId,
      { walletAddress: walletAddress.toLowerCase() },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Wallet address linked successfully.",
      walletAddress: user.walletAddress,
    });
  } catch (error) {
    console.error("Wallet update error:", error);
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Token expired. Please log in again." });
    }
    return res
      .status(500)
      .json({ message: "Server error while linking wallet." });
  }
});
/*
Testing : Patch api/v1/user/update-wallet
Request -
Body:  
{
  "walletAddress": "0x9eC07A2a9170B09D2321A877B63fd1a7456224d9"
}

Authorization: Bearer <token>

Response - 
200 OK
  {
    "message": "Wallet address linked successfully.",
    "walletAddress": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9"
  }

*/

module.exports = router;
