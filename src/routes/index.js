const express = require("express");
const userRouter = require("./User/user");

const router = express.Router();
router.use("/user", userRouter);

module.exports = router;
