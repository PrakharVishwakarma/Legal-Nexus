require("dotenv").config();
const express = require("express");
const cors = require("cors");
const dbConnect = require("./dbConnect");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
dbConnect();

// Routes
const mainRouter = require("./routes/index");
app.use("/api/v1", mainRouter);

// Start Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
