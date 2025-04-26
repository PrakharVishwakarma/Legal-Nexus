// /src/routes/Case/case.js

const express = require("express");

const z = require("zod");

const uuid = require("uuid-v4");

const { authMiddleware } = require("../../Middlewares/authMw");

const Case = require("../../Models/caseModel");

const {
  grantAccess,
  revokeAccess,
  transferCaseOwnership,
} = require("../../utils/smartContract");

const router = express.Router();

const createCaseSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  courtName: z.string().optional(),
});

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const parsedData = createCaseSchema.safeParse(req.body);

    if (!parsedData.success) {
      return res.status(400).json({
        message: "Incorrect inputs",
        errors: parsedData.error.errors,
      });
    }

    const { title, description, courtName } = parsedData.data;
    const adminWallet = req.userWalletAddress;
    const caseAdminRole = req.userRole;

    if (!["Lawyer", "Police", "Judge"].includes(caseAdminRole)) {
      return res.status(400).json({
        message:
          "Only system employees (Judge, Lawyer, Police) can create a case.",
      });
    }

    const caseId = uuid();

    const newCase = await Case.create({
      caseId,
      title,
      description,
      courtName,
      createdBy: adminWallet,
      admin: adminWallet,
      adminHistory: [
        {
          wallet: adminWallet,
          changedAt: new Date(),
        },
      ],
      participants: [
        {
          wallet: adminWallet,
          role: caseAdminRole,
          permissions: {
            canView: true,
            canUpload: true,
          },
          addedAt: new Date(),
        },
      ],
    });

    return res.status(201).json({
      message: "Case created successfully",
      caseId,
      caseDbId: newCase._id,
    });
  } catch (err) {
    console.error("❌ Case creation failed:", err);
    return res.status(500).json({ error: err.message });
  }
});
/*
Testing : POST api/v1/case/create

Body -
{
  "title" : "Massive investment Fraud",
  "description": " former stockbroker, defrauded investors of billions of dollars by using a Ponzi scheme, where new investors' money was used to pay off earlier investors, rather than legitimate investments.",
  "courtName" : "State High Court of Madhya Pradesh, Jabalpur"
}

Headers -
Authorization : Bearer <token>

Response -
{
  "message": "Case created successfully",
  "caseId": "60bb182e-4606-4e35-98bb-03659e46f75a",
  "caseDbId": "680a2129ab1c6d62642aa55a"
}
*/

const grantAccessSchema = z.object({
  caseId: z.string().uuid(),
  participant: z.object({
    wallet: z.string().startsWith("0x").length(42),
    role: z.enum(["Judge", "Lawyer", "Police", "Civilian"]),
    permissions: z.object({
      canView: z.boolean(),
      canUpload: z.boolean(),
    }),
  }),
});
router.patch("/grant-access", authMiddleware, async (req, res) => {
  try {
    const parsed = grantAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid input", errors: parsed.error.errors });
    }

    const { caseId, participant } = parsed.data;
    const caseDoc = await Case.findOne({ caseId });

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseDoc.admin.toLowerCase() !== req.userWalletAddress.toLowerCase()) {
      return res
        .status(403)
        .json({ message: "Only the case admin can grant access" });
    }

    const alreadyExists = caseDoc.participants.some(
      (p) => p.wallet.toLowerCase() === participant.wallet.toLowerCase()
    );

    if (alreadyExists) {
      return res
        .status(409)
        .json({ message: "Participant already exists in the case" });
    }

    // Append to MongoDB
    caseDoc.participants.push({
      ...participant,
      addedAt: new Date(),
    });

    await caseDoc.save();

    // Call Smart Contract
    const txHash = await grantAccess(caseId, participant.wallet);

    return res.status(200).json({
      message: "Participant added successfully",
      txHash,
      participant,
    });
  } catch (err) {
    console.error("Grant access error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});
/*
Testing : PATCH api/v1/case/grant-access

Body -
{
  "caseId": "60bb182e-4606-4e35-98bb-03659e46f75a",
  "participant": {
    "wallet": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9",
    "role": "Civilian",
    "permissions": {
      "canView": true,
      "canUpload": false
    }
  }
}

Headers -
Authorization : Bearer <token>

Response - 
{
  "message": "Participant added successfully",
  "txHash": "0xd535c929909c50d491897d236a2338e2a504874faa7c43b3e69e95082a0ade8f",
  "participant": {
    "wallet": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9",
    "role": "Civilian",
    "permissions": {
      "canView": true,
      "canUpload": false
    }
  }
}
*/

const revokeAccessSchema = z.object({
  caseId: z.string().uuid(),
  wallet: z.string().startsWith("0x").length(42),
});
router.patch("/revoke-access", authMiddleware, async (req, res) => {
  try {
    const parsed = revokeAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { caseId, wallet } = parsed.data;
    const caseDoc = await Case.findOne({ caseId });

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseDoc.admin.toLowerCase() !== req.userWalletAddress.toLowerCase()) {
      return res
        .status(403)
        .json({ message: "Only the admin can revoke access" });
    }

    const existingParticipant = caseDoc.participants.find(
      (p) => p.wallet.toLowerCase() === wallet.toLowerCase()
    );

    if (!existingParticipant) {
      return res
        .status(404)
        .json({ message: "Participant not found in this case" });
    }

    // Remove participant from array
    caseDoc.participants = caseDoc.participants.filter(
      (p) => p.wallet.toLowerCase() !== wallet.toLowerCase()
    );

    await caseDoc.save();

    // Call Smart Contract
    const txHash = await revokeAccess(caseId, wallet);

    return res.status(200).json({
      message: "Access revoked successfully",
      revokedWallet: wallet,
      txHash,
    });
  } catch (err) {
    console.error("Revoke access error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});
/*
Testing : PATCH api/v1/case/revoke-access

Body -
{
  "caseId": "60bb182e-4606-4e35-98bb-03659e46f75a",
  "wallet": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9"
}

Headers -
Authorization : Bearer <token>

Response - 
{
  "message": "Access revoked successfully",
  "revokedWallet": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9",
  "txHash": "0xaa1e840fdeb377b3ed95083da6363c5424c01b0cf5425e052a1173ed8805f7da"
}

*/

const changeAdminSchema = z.object({
  caseId: z.string().uuid(),
  newAdminWallet: z.string().startsWith("0x").length(42),
});
router.patch("/change-admin", authMiddleware, async (req, res) => {
  try {
    const parsed = changeAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { caseId, newAdminWallet } = parsed.data;
    const caseDoc = await Case.findOne({ caseId });

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseDoc.admin.toLowerCase() !== req.userWalletAddress.toLowerCase()) {
      return res.status(403).json({
        message: "Only the current case admin can perform this action.",
      });
    }

    const participantExists = caseDoc.participants.some(
      (p) => p.wallet.toLowerCase() === newAdminWallet.toLowerCase()
    );

    if (!participantExists) {
      return res
        .status(400)
        .json({ message: "New admin must be a case participant" });
    }

    if (newAdminWallet.toLowerCase() === req.userWalletAddress.toLowerCase()) {
      return res
        .status(400)
        .json({ message: "You are already the case admin" });
    }

    caseDoc.admin = newAdminWallet;

    caseDoc.adminHistory.push({
      wallet: newAdminWallet,
      changedAt: new Date(),
    });

    await caseDoc.save();

    const txHash = await transferCaseOwnership(caseId, newAdminWallet);

    return res.status(200).json({
      message: "Case admin changed successfully",
      newAdmin: newAdminWallet,
      txHash,
    });
  } catch (err) {
    console.error("Change admin error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const wallet = req.userWalletAddress.toLowerCase();

    const [ownedCases, participatingCases] = await Promise.all([
      Case.find({ admin: wallet }).lean(),
      Case.find({ "participants.wallet": wallet }).lean(),
    ]);

    // De-duplicate (e.g. if a user is both admin & participant)
    const ownedIds = new Set(ownedCases.map((c) => c._id.toString()));
    const filteredParticipating = participatingCases.filter(
      (c) => !ownedIds.has(c._id.toString())
    );

    return res.status(200).json({
      ownedCases,
      participatingCases: filteredParticipating,
    });
  } catch (err) {
    console.error("Error fetching cases:", err);
    return res.status(500).json({ message: "Failed to retrieve cases" });
  }
});

router.get("/:caseId", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    const caseDoc = await Case.findOne({ caseId }).lean();

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    const isAdmin = caseDoc.admin.toLowerCase() === wallet;
    const isParticipant = caseDoc.participants.some(
      (p) => p.wallet.toLowerCase() === wallet
    );

    if (!isAdmin && !isParticipant) {
      return res
        .status(403)
        .json({ message: "You do not have access to this case" });
    }

    return res.status(200).json({ case: caseDoc });
  } catch (err) {
    console.error("Error fetching case:", err);
    return res.status(500).json({ message: "Failed to fetch case details" });
  }
});

router.patch("/:caseId/close", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    const caseDoc = await Case.findOne({ caseId });

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseDoc.admin.toLowerCase() !== wallet) {
      return res
        .status(403)
        .json({ message: "Only the case admin can close this case" });
    }

    if (caseDoc.isClosed) {
      return res.status(400).json({ message: "Case is already closed" });
    }

    caseDoc.isClosed = true;

    // Optionally, track close time (if field was added)
    // caseDoc.closedAt = new Date();

    await caseDoc.save();

    return res.status(200).json({
      message: "Case successfully closed",
      caseId: caseDoc.caseId,
    });
  } catch (err) {
    console.error("Error closing case:", err);
    return res.status(500).json({ message: "Failed to close the case" });
  }
});

module.exports = router;
