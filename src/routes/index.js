// /routes/index.js

const express = require("express");
const userRouter = require("./User/user");
const caseRouter = require("./Case/case")

const router = express.Router();
router.use("/user", userRouter);
router.use("/case", caseRouter);

module.exports = router;
