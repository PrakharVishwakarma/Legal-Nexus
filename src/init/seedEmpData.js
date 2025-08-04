// /init/seedEmpData.js

const mongoose = require("mongoose");
require("dotenv").config();
const { Employee } = require("../Models/employeeModel");

const seedEmployeeData = async () => {
  console.log("Seeding Data On : ", process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI);

  const employees = [
    { employeeId: "judge567", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer123", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police789", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge001", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer002", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police003", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge004", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer005", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police006", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge007", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer008", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police009", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge010", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer011", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police012", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge013", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer014", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police015", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge016", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer017", role: "Lawyer", verificationStatus: "Verified" },
    { employeeId: "police018", role: "Police", verificationStatus: "Verified" },
    { employeeId: "judge019", role: "Judge", verificationStatus: "Verified" },
    { employeeId: "lawyer020", role: "Lawyer", verificationStatus: "Verified" },
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
