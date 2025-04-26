// /routes/index.js

const express = require("express");
const userRouter = require("./User/user");
const caseRouter = require("./Case/case")
const caseDocumentRouter = require("./CaseDocument/caseDocument");

const router = express.Router();
router.use("/user", userRouter);
router.use("/case", caseRouter);
router.use("/case-doc", caseDocumentRouter);

module.exports = router;
