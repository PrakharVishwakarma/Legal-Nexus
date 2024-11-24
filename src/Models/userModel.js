// //Models/userModel.js

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const roles = ["Admin", "Judge", "Lawyer", "Police", "Civilian"];

const userSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: roles,
        required: true,
    },
    firstName: {
        type: String,
        required: true,
        trim: true,
        maxLength: 50,
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
        maxLength: 50,
    },
    aadharNumber: {
        type: String,
        required: true,
        unique: true,
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
    },
    userId: {
        type: String,
        unique: true,
        required: function () {
            return this.role === "Civilian" || this.role === "Admin";
        },
    },
    employeeId: {
        type: String,
        unique: true,
        required: function () {
            return ["Judge", "Lawyer", "Police"].includes(this.role);
        },
    },
    hashedPassword: {
        type: String,
        required: true,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    otp: {
        type: String,
        required: false,
    },
    otpExpiry: {
        type: Date,
        required: false,
    },
    resetOtp: {
        type: String,
        required: false,
    },
    resetOtpExpiry: {
        type: Date,
        required: false,
    },
});

userSchema.methods.createHash = async function (plainTextPassword) {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    return await bcrypt.hash(plainTextPassword, salt);
};

userSchema.methods.validatePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.hashedPassword);
};

const User = mongoose.model("User", userSchema);

module.exports = { User, roles };
