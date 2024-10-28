const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: true,
        unique: true,
    },
    role: {
        type: String,
        enum: ["Judge", "Lawyer", "Police"],
        required: true,
    },
    verificationStatus: {
        type: String,
        enum: ["Verified", "Pending", "Revoked"],
        default: "Pending",
    },
});

const Employee = mongoose.model("Employee", employeeSchema);

module.exports = { Employee };
