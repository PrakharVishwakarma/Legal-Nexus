const mongoose = require("mongoose");
require("dotenv").config();
const { Employee } = require("../Models/employeeModel");

const seedEmployeeData = async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    const employees = [
        { employeeId: "judge567", role: "Judge", verificationStatus: "Verified" },
        { employeeId: "lawyer123", role: "Lawyer", verificationStatus: "Verified" },
        { employeeId: "police789", role: "Police", verificationStatus: "Verified" },
    ];

    try {
        await Employee.insertMany(employees);
        console.log("Employee data seeded successfully.");
    } catch (err) {
        console.error("Error seeding employee data:", err);
    } finally {
        mongoose.connection.close();
    }
};

seedEmployeeData();
