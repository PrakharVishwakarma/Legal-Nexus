// /src/routes/Case/cases.js

const express = require("express");

const z = require("zod");

const uuid = require("uuid-v4");

const { authMiddleware } = require("../../Middlewares/authMw");

const Case = require("../../Models/caseModel");

const { User } = require("../../Models/userModel");

const CaseDocument = require("../../Models/caseDocumentModel");

const {
  grantAccess,
  revokeAccess,
  transferCaseOwnership,
  registerCase,
  closeCaseOnChain,
} = require("../../utils/smartContract");

const router = express.Router();

const createCaseSchema = z.object({
  title: z.string().min(3).max(75),
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

    // const caseId = uuid();

    const newCase = await Case.create({
      // caseId,
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

    // 🔥 Blockchain Smart Contract Call
    const caseIdStr = newCase._id.toString(); // explicitly convert to string
    const txHash = await registerCase(caseIdStr, adminWallet);

    return res.status(201).json({
      message: "Case created successfully",
      // caseId,
      caseDbId: newCase._id,
      txHash, // Send txHash in response too
    });
  } catch (err) {
    console.error("❌ Case creation failed:", err);
    return res.status(500).json({ error: err.message });
  }
});
/*
Testing : POST api/v1/cases/create

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
  "caseDbId": "680a2129ab1c6d62642aa55a"
}
*/

const grantAccessSchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum wallet address"),
  role: z.enum(["Judge", "Lawyer", "Police", "Civilian"]),
  permissions: z.object({
    canView: z.boolean(),
    canUpload: z.boolean(),
  }),
});

router.patch("/:id/grant-access", authMiddleware, async (req, res) => {
  try {
    const caseId = req.params.id;

    const parsed = grantAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid input", errors: parsed.error.errors });
    }

    const { wallet, role, permissions } = parsed.data;

    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseDoc.admin !== req.userWalletAddress) {
      return res
        .status(403)
        .json({ message: "Only the case admin can grant access" });
    }

    if (wallet === caseDoc.admin) {
      return res.status(400).json({ message: "Admin already owns the case" });
    }

    const isDuplicate = caseDoc.participants.some(
      (p) => p.wallet === wallet
    );

    if (isDuplicate) {
      return res
        .status(409)
        .json({ message: "Participant already exists in the case" });
    }

    const caseIdStr = caseDoc._id.toString();

    const txHash = await grantAccess(caseIdStr, wallet);

    caseDoc.participants.push({
      wallet: wallet,
      role,
      permissions,
      addedAt: new Date(),
    });

    await caseDoc.save();

    return res.status(200).json({
      message: "Participant added successfully",
      txHash,
      participant: { wallet, role, permissions },
    });
  } catch (err) {
    console.error("Grant access error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
Testing : PATCH api/v1/cases/64a5c938dcbe81c9aabc1234/grant-access
Content-Type: application/json

{
  "wallet": "0xAbc123...456",
  "role": "Lawyer",
  permissions{
    "canUpload": true,
    "canView": true
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

router.delete(
  "/:caseId/revoke-access/:wallet",
  authMiddleware,
  async (req, res) => {
    try {
      const revokeAccessSchema = z.object({
        caseId: z.string(),
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
      });

      const parsed = revokeAccessSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: parsed.error.errors,
        });
      }

      const { caseId, wallet } = parsed.data;
      const normalizedWallet = wallet;

      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ message: "Case not found" });
      }

      if (caseDoc.admin !== req.userWalletAddress) {
        return res
          .status(403)
          .json({ message: "Only the admin can revoke access" });
      }

      if (normalizedWallet === caseDoc.admin) {
        return res
          .status(400)
          .json({ message: "Cannot revoke access from the case admin" });
      }

      const existingParticipant = caseDoc.participants.find(
        (p) => p.wallet === normalizedWallet
      );
      if (!existingParticipant) {
        return res
          .status(404)
          .json({ message: "Participant not found in this case" });
      }

      caseDoc.participants = caseDoc.participants.filter(
        (p) => p.wallet !== normalizedWallet
      );

      await caseDoc.save();

      const txHash = await revokeAccess(caseId, wallet);

      return res.status(200).json({
        message: "Access revoked successfully",
        revokedWallet: wallet,
        txHash,
      });
    } catch (err) {
      console.error("[RevokeAccess]", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

const changeAdminSchema = z.object({
  newAdminWallet: z.string().startsWith("0x").length(42),
  roleOfNewAdmin: z.enum(["Lawyer", "Police", "Judge"]),
});

router.patch("/:caseId/migrate-admin", authMiddleware, async (req, res) => {
  const parsed = changeAdminSchema.safeParse(req.body);
  try {
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { newAdminWallet, roleOfNewAdmin } = parsed.data;
    const caseId = req.params.caseId;
    const userWallet = req.userWalletAddress;

    if( !["Lawyer", "Police", "Judge"].includes(roleOfNewAdmin)) {
      return res.status(403).json({ error: "Owner ship of the case can only be transferred to a Lawyer, Police or Judge" });
    }

    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: "Case not found" });
    }

    // Only current admin can transfer ownership
    if (caseDoc.admin !== userWallet) {
      return res
        .status(403)
        .json({ error: "Only current admin can transfer ownership" });
    }

    // No-op if same admin
    if (userWallet === newAdminWallet) {
      return res.status(400).json({ error: "You are already the admin" });
    }

    // Ensure new admin is a participant
    const newAdminParticipant = caseDoc.participants.find(
      (p) => p.wallet === newAdminWallet
    );
    if (!newAdminParticipant) {
      return res
        .status(400)
        .json({ error: "New admin must be a case participant" });
    }

    // Simulate smart contract ownership transfer
    const caseIdStr = caseDoc._id.toString();
    const txHash = await transferCaseOwnership(caseIdStr, newAdminWallet);

    // Update admin in the document
    caseDoc.admin = newAdminWallet;

    // Add to admin change history
    caseDoc.adminHistory.push({
      wallet: newAdminWallet,
      changedAt: new Date(),
    });

    // Update participant permissions (demote old admin, promote new)
    caseDoc.participants = caseDoc.participants.map((p) => {
      const pWallet = p.wallet;
      if (pWallet === userWallet) {
        p.permissions = { canView: true, canUpload: false };
      } else if (pWallet === newAdminWallet) {
        p.permissions = { canView: true, canUpload: true };
      }
      return p;
    });

    await caseDoc.save();

    // Update document-level permissions for old and new admin

    // 1. Downgrade old admin
    const downgradeOldAdmin = CaseDocument.updateMany(
      { caseId, "accessControl.wallet": userWallet },
      {
        $set: {
          "accessControl.$.canView": true,
          "accessControl.$.canDelete": false,
        },
      }
    );

    // 2. Upgrade existing new admin if already in accessControl
    const upgradeNewAdmin = CaseDocument.updateMany(
      { caseId, "accessControl.wallet": newAdminWallet },
      {
        $set: {
          "accessControl.$.canView": true,
          "accessControl.$.canDelete": true,
        },
      }
    );

    // 3. Push new admin if not already in accessControl
    const pushNewAdminIfNotExists = CaseDocument.updateMany(
      {
        caseId,
        accessControl: { $not: { $elemMatch: { wallet: newAdminWallet } } },
      },
      {
        $push: {
          accessControl: {
            wallet: newAdminWallet,
            canView: true,
            canDelete: true,
          },
        },
      }
    );

    await Promise.all([
      downgradeOldAdmin,
      upgradeNewAdmin,
      pushNewAdminIfNotExists,
    ]);

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

// router.get("/", authMiddleware, async (req, res) => {
//   try {
//     const wallet = req.userWalletAddress.toLowerCase();

//     const [ownedCases, participatingCases] = await Promise.all([
//       Case.find({ admin: wallet }).lean(),
//       Case.find({ "participants.wallet": wallet }).lean(),
//     ]);

//     // De-duplicate (e.g. if a user is both admin & participant)
//     const ownedIds = new Set(ownedCases.map((c) => c._id.toString()));
//     const filteredParticipating = participatingCases.filter(
//       (c) => !ownedIds.has(c._id.toString())
//     );

//     return res.status(200).json({
//       ownedCases,
//       participatingCases: filteredParticipating,
//     });
//   } catch (err) {
//     console.error("Error fetching cases:", err);
//     return res.status(500).json({ message: "Failed to retrieve cases" });
//   }
// });

// Define Zod schema for query parameters

const querySchema = z.object({
  isClosed: z
    .string()
    .optional()
    .transform((val) =>
      val === "true" ? true : val === "false" ? false : undefined
    ),

  filterAdmin: z
    .string()
    .optional()
    .transform((val) => val === "true"),

  filterParticipant: z
    .string()
    .optional()
    .transform((val) => val === "true"),

  sortBy: z.enum(["title", "createdAt"]).optional().default("createdAt"),

  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),

  page: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val, 12);
      return isNaN(parsed) || parsed < 1 ? 1 : parsed;
    }),

  pageSize: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val, 12);
      if (isNaN(parsed) || parsed < 1) return 12;
      if (parsed > 100) return 100;
      return parsed;
    }),
});

// ✅ GET /api/v1/cases/get-cases
router.get("/get-cases", authMiddleware, async (req, res) => {
  try {
    const userWallet = req.userWalletAddress;

    // ✅ Validate and parse query params
    const result = querySchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid query parameters.",
        errors: result.error.flatten(),
      });
    }

    const {
      isClosed,
      filterAdmin,
      filterParticipant,
      sortBy,
      sortOrder,
      page,
      pageSize,
    } = result.data;

    // ✅ Build MongoDB query
    const query = {};
    if (typeof isClosed === "boolean") {
      query.isClosed = isClosed;
    }

    const orConditions = [];

    // ✅ Admin filter
    if (filterAdmin) {
      orConditions.push({ admin: userWallet });
    }

    // ✅ Participant filter (not admin, canView = true)
    if (filterParticipant) {
      orConditions.push({
        admin: { $ne: userWallet },
        participants: {
          $elemMatch: {
            wallet: userWallet,
            "permissions.canView": true,
          },
        },
      });
    }

    // ✅ Default access: return all cases user can at least view
    if (!filterAdmin && !filterParticipant) {
      orConditions.push({ admin: userWallet });
      orConditions.push({
        participants: {
          $elemMatch: {
            wallet: userWallet,
            "permissions.canView": true,
          },
        },
      });
    }

    query.$or = orConditions;

    // ✅ Total count
    const totalCases = await Case.countDocuments(query);

    // ✅ Fetch paginated and sorted data
    const cases = await Case.find(query)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // ✅ Send response
    return res.status(200).json({
      cases,
      currentPage: page,
      pageSize,
      totalCases,
      totalPages: Math.ceil(totalCases / pageSize),
    });
  } catch (err) {
    console.error("Error fetching cases:", err);
    return res.status(500).json({ message: "Failed to retrieve cases." });
  }
});

// ✅ GET /cases/:caseId — Get full case details (if authorized)
router.get("/:caseId", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress;

    // ✅ Fetch the case
    const caseDoc = await Case.findById(caseId).lean();
    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found." });
    }

    // ✅ Check if user is the case admin
    const isUserCaseAdmin = caseDoc.admin === wallet;

    // ✅ Initialize permission flags
    let hasUserViewAccess = false;
    let hasUserUploadAccess = false;

    // ✅ Only evaluate participant permissions if not admin
    if (!isUserCaseAdmin) {
      const participant = caseDoc.participants.find(
        (p) => p.wallet === wallet
      );

      if (participant?.permissions?.canView) {
        hasUserViewAccess = true;

        if (participant.permissions.canUpload) {
          hasUserUploadAccess = true;
        }
      }
    } else {
      // ✅ Admins always have full access
      hasUserViewAccess = true;
      hasUserUploadAccess = true;
    }

    // ✅ Final access control check
    if (!hasUserViewAccess) {
      return res.status(403).json({
        message: "You do not have permission to view this case.",
      });
    }

    const adminData = await User.findOne({
      walletAddress: caseDoc.admin,
    }).select("firstName lastName role");

    // ✅ Return the case with structured permissions
    return res.status(200).json({
      case: caseDoc,
      permissions: {
        isUserCaseAdmin,
        hasUserViewAccess,
        hasUserUploadAccess,
      },
      adminData: adminData,
    });
  } catch (err) {
    console.error("Error fetching case:", err);
    return res.status(500).json({ message: "Failed to fetch case details." });
  }
});

router.patch("/:caseId/close", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress;

    const caseDoc = await Case.findOne({ _id: caseId });

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseDoc.admin !== wallet) {
      return res
        .status(403)
        .json({ message: "Only the case admin can close this case" });
    }

    if (caseDoc.isClosed) {
      return res.status(400).json({ message: "Case is already closed" });
    }

    caseDoc.isClosed = true;
    await caseDoc.save();

    // 🔥 Blockchain Smart Contract Call
    const txHash = await closeCaseOnChain(caseId);

    return res.status(200).json({
      message: "Case successfully closed",
      // caseId: caseDoc.caseId,
      caseId: caseDoc._id,
      txHash, // Send txHash in response too
    });
  } catch (err) {
    console.error("Error closing case:", err);
    return res.status(500).json({ message: "Failed to close the case" });
  }
});

const updateMetadataSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  courtName: z.string().min(3).max(100).optional(),
});
router.patch("/cases/:caseId/metadata", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.user?.wallet; // from auth middleware

    if (!caseId || !wallet) {
      return res
        .status(400)
        .json({ error: "Missing caseId or user authentication" });
    }

    // Parse and validate request body
    const parsed = updateMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: parsed.error.format() });
    }

    const metadata = parsed.data;

    // Fetch case and check access
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: "Case not found" });
    }

    if (caseDoc.admin !== wallet) {
      return res
        .status(403)
        .json({ error: "Only the case admin can update metadata" });
    }

    // Update fields conditionally
    Object.assign(caseDoc, metadata);
    await caseDoc.save();

    return res.status(200).json({
      message: "Case metadata updated successfully",
      case: {
        _id: caseDoc._id,
        title: caseDoc.title,
        description: caseDoc.description,
        courtName: caseDoc.courtName,
      },
    });
  } catch (err) {
    console.error("Error updating case metadata:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
