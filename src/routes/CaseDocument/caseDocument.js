// /src/routes/CaseDocument/caseDocument.js
const express = require("express");
const Case = require("../../Models/caseModel");
const CaseDocument = require("../../Models/caseDocumentModel");
const AccessAuditLog = require("../../Models/accessAuditLogModel");
const { User } = require("../../Models/userModel");
const { authMiddleware } = require("../../Middlewares/authMw");
const z = require("zod");

const router = express.Router();

// ---------------- POST /case-doc/upload ------------------
const uploadSchema = z.object({
  caseId: z.string(),
  title: z.string().min(3),
  fileType: z.string(),
  fileSize: z.number().optional(),
  ipfsCid: z.string().min(10),
  encrypted: z.boolean(),
  accessControl: z
    .array(
      z.object({
        wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        canView: z.boolean().optional(),
        canDelete: z.boolean().optional(),
      })
    )
    .optional(),
});
router.post("/upload", authMiddleware, async (req, res) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid input", errors: parsed.error.errors });
    }

    const {
      caseId,
      title,
      fileType,
      fileSize,
      ipfsCid,
      encrypted,
      accessControl = [],
    } = parsed.data;

    const caseDoc = await Case.findOne({ _id: caseId });
    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    const wallet = req.userWalletAddress;
    const adminWallet = caseDoc.admin;

    const isAdmin = wallet === adminWallet;

    const participant = caseDoc.participants.find((p) => p.wallet === wallet);

    const canUpload = isAdmin || participant?.permissions?.canUpload;

    if (!canUpload) {
      return res
        .status(403)
        .json({ message: "You do not have upload permissions for this case" });
    }

    const accessMap = new Map();

    // Add existing accessControl (normalized)
    for (const entry of accessControl) {
      const addr = entry.wallet;
      accessMap.set(addr, {
        wallet: addr,
        canView: entry.canView ?? false,
        canDelete: entry.canDelete ?? false,
      });
    }

    // Ensure uploader has full access
    accessMap.set(wallet, {
      wallet,
      canView: true,
      canDelete: true,
    });

    // Ensure admin has full access (unless already the uploader)
    if (!accessMap.has(adminWallet)) {
      accessMap.set(adminWallet, {
        wallet: adminWallet,
        canView: true,
        canDelete: true,
      });
    }

    const completeAccessControl = Array.from(accessMap.values());
    // TODO => While changing the admin of a case, update the access controls accordingly of all caseDoc belonging to that case

    const newDoc = await CaseDocument.create({
      caseId: caseDoc._id,
      uploadedBy: wallet,
      title,
      fileType,
      fileSize,
      ipfsCid,
      encrypted,
      accessControl: completeAccessControl,
      isDeleted: false,
    });

    // Audit Log
    await AccessAuditLog.create({
      docId: newDoc._id,
      docModel: "CaseDocument",
      caseId: caseDoc._id,
      userWallet: wallet,
      userRole: req.userRole,
      action: "UPLOADED",
    });

    return res.status(201).json({
      message: "Document uploaded successfully",
      docId: newDoc._id,
    });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({ message: "Failed to upload document" });
  }
});
/*
Testing : POST /case-doc/upload

Body - 
{
  "caseId": "15da32c9-4b9d-4029-8bfb-3b8b7947c510",
  "title": "string",
  "fileType": "string",
  "fileSize": 12345,
  "ipfsCid": "bafybeid37edltjdqwi4frb3ki5c4ty73a7p6iuws3q5gerwdbpkcxvhceq",
  "encrypted": false,
}

Headers -
Authorization : Bearer <token>

Response - 
{
  "message": "Document uploaded successfully",
  "docId": "680f93f3b5ff6d7f9c2e2ba9"
}

*/

// ------------ PATCH api/v1/case-doc/:caseId/:docId/grant-access ------------
const grantAccessSchema = z.object({
  targetWallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  permissions: z.object({
    canView: z.boolean().optional(),
    canDelete: z.boolean().optional(),
  }),
});
router.patch(
  "/:caseId/:docId/grant-access",
  authMiddleware,
  async (req, res) => {
    try {
      const { caseId, docId } = req.params;
      const normalizedUserWallet = req.userWalletAddress.toLowerCase();

      const parsed = grantAccessSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "Invalid input", errors: parsed.error.errors });
      }

      const { targetWallet, permissions } = parsed.data;
      const normalizedTargetWallet = targetWallet.toLowerCase();
      const { canView = false, canDelete = false } = permissions;

      if (normalizedUserWallet === normalizedTargetWallet) {
        return res
          .status(400)
          .json({ message: "You cannot grant access to yourself." });
      }

      const [caseData, doc] = await Promise.all([
        Case.findById(caseId),
        CaseDocument.findById(docId),
      ]);

      if (!caseData) {
        return res.status(404).json({ message: "Parent case not found." });
      }

      if (!doc) {
        return res.status(404).json({ message: "Document not found." });
      }

      if (normalizedTargetWallet === caseData.admin.toLowerCase()) {
        return res
          .status(400)
          .json({ message: "Cannot grant access to case admin." });
      }

      // Only uploader or admin can grant access
      const isUploader = doc.uploadedBy.toLowerCase() === normalizedUserWallet;
      const isAdmin = caseData.admin.toLowerCase() === normalizedUserWallet;
      if (!isUploader && !isAdmin) {
        return res.status(403).json({
          message: "Only uploader or case admin can grant access.",
        });
      }

      // Ensure target is a case participant
      const isParticipant = caseData.participants.some(
        (p) => p.wallet.toLowerCase() === normalizedTargetWallet
      );
      if (!isParticipant) {
        return res.status(403).json({
          message: "Target wallet must be a participant in the case.",
        });
      }

      // Check if already exists with same permissions
      const idx = doc.accessControl.findIndex(
        (entry) => entry.wallet.toLowerCase() === normalizedTargetWallet
      );
      if (
        idx !== -1 &&
        doc.accessControl[idx].canView === canView &&
        doc.accessControl[idx].canDelete === canDelete
      ) {
        return res.status(200).json({
          message:
            "No change needed. Access already granted with same permissions.",
        });
      }

      if (idx !== -1) {
        doc.accessControl[idx].canView = canView;
        doc.accessControl[idx].canDelete = canDelete;
      } else {
        doc.accessControl.push({
          wallet: normalizedTargetWallet,
          canView,
          canDelete,
        });
      }

      await doc.save();

      await AccessAuditLog.create({
        docId: doc._id,
        docModel: "CaseDocument",
        caseId: doc.caseId,
        userWallet: normalizedUserWallet,
        userRole: req.userRole,
        action: "SHARED",
        notes: `Granted ${[canView && "view", canDelete && "delete"]
          .filter(Boolean)
          .join(" & ")} access to ${targetWallet}`,
        ipAddress: req.ip || null,
      });

      return res.status(200).json({
        message: "Access granted successfully",
        grantedTo: targetWallet,
        permissions: { canView, canDelete },
      });
    } catch (err) {
      console.error("Error granting access:", err);
      return res
        .status(500)
        .json({ message: "Server error while granting access." });
    }
  }
);

/*
Testing : POST /case-doc/:docId/grant-access

Body - 
{
  "targetWallet": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9",
  "permissions": {
    "canView": true,
    "canDelete": false
  }
}
Headers -
Authorization : Bearer <token>

Response - 
{
  "message": "Access granted successfully",
  "grantedTo": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9",
  "permissions": {
    "canView": true,
    "canDelete": false
  }
}

*/

/* 
There is no need for extra revoke-access route. becuase the grant-access route can handle both the functionality of granting and revoking access.

// ------------ PATCH /case-doc/:docId/revoke-access ------------
const revokeAccessSchema = z.object({
  targetWallet: z
  .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum wallet address"),
  permissions: z.object({
    canView: z.boolean().optional(),
    canDelete: z.boolean().optional(),
  }),
});
router.patch("/:docId/revoke-access", authMiddleware, async (req, res) => {
  try {
    const { docId } = req.params;
    const parsed = revokeAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { targetWallet, permissions } = parsed.data;
    const { canView = false, canDelete = false } = permissions;
    
    if (!canView && !canDelete) {
      return res.status(400).json({
        message:
          "At least one permission (canView or canDelete) must be set to true for revocation.",
        });
      }
      
    const doc = await CaseDocument.findById(docId);
    if (!doc || doc.isDeleted) {
      return res
      .status(404)
      .json({ message: "Document not found or deleted." });
    }
    
    const caseData = await Case.findById(doc.caseId);
    if (!caseData) {
      return res.status(404).json({ message: "Parent case not found." });
    }
    
    const adminWallet = req.userWalletAddress.toLowerCase();
    if (caseData.admin.toLowerCase() !== adminWallet) {
      return res.status(403).json({
        message: "Only the case admin can revoke access.",
      });
    }
    
    const index = doc.accessControl.findIndex(
      (entry) => entry.wallet.toLowerCase() === targetWallet.toLowerCase()
    );
    
    if (index === -1) {
      return res.status(404).json({
        message: "Target wallet does not have any access on this document.",
      });
    }

    // Revoke specified permissions
    const targetEntry = doc.accessControl[index];
    if (canView) targetEntry.canView = false;
    if (canDelete) targetEntry.canDelete = false;

    // If both permissions are false, remove the entry
    if (!targetEntry.canView && !targetEntry.canDelete) {
      doc.accessControl.splice(index, 1);
    }

    await doc.save();
    
    // Log the action
    await AccessAuditLog.create({
      docId: doc._id,
      docModel: "CaseDocument",
      caseId: doc.caseId,
      userWallet: adminWallet,
      userRole: req.userRole,
      action: "REVOKED",
      notes: `Revoked ${canView ? "view" : ""}${
        canView && canDelete ? " & " : ""
      }${canDelete ? "delete" : ""} for ${targetWallet}`,
    });
    
    return res.status(200).json({
      message: "Access revoked successfully.",
      target: targetWallet,
      revoked: { canView, canDelete },
    });
  } catch (err) {
    console.error("Error revoking access:", err);
    return res.status(500).json({
      message: "Server error during access revocation.",
    });
  }
});
Testing : POST /case-doc/:docId/revoke-access

Body - 
{
  "targetWallet": "0x9ec07a2a9170b09d2321a877b63fd1a7456224d9",
  "permissions": {
    "canView": false,
    "canDelete": false
  }
}
Headers -
Authorization : Bearer <token>

Response - 
*/

// PATCH /case-doc/:docId/revoke-access
const revokeAccessSchema = z.object({
  targetWallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});
router.patch(
  "/:caseId/:docId/revoke-access",
  authMiddleware,
  async (req, res) => {
    try {
      const { caseId, docId } = req.params;
      const parsed = revokeAccessSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "Invalid input", errors: parsed.error.errors });
      }

      const { targetWallet } = parsed.data;

      const requesterWallet = req.userWalletAddress.toLowerCase();
      const normalizedTarget = targetWallet.toLowerCase();

      // Using promise.all
      const [parentCase, doc] = await Promise.all([
        Case.findById(caseId),
        CaseDocument.findById(docId),
      ]);

      if (!parentCase) {
        return res.status(404).json({ message: "Parent case not found." });
      }

      if (!doc) {
        return res.status(404).json({ message: "Document not found." });
      }

      const caseAdmin = parentCase.admin.toLowerCase();
      const uploaderWallet = doc.uploadedBy.toLowerCase();

      if (normalizedTarget === requesterWallet) {
        return res.status(403).json({
          message: "You cannot revoke access of yourself.",
        });
      }

      if (requesterWallet !== caseAdmin && requesterWallet !== uploaderWallet) {
        return res.status(403).json({
          message:
            "Only the case admin or the creator of document can revoke access.",
        });
      }

      // Protect admin from being removed
      if (normalizedTarget === caseAdmin) {
        return res.status(403).json({
          message: "Cannot revoke access from the case admin.",
        });
      }

      // Check if target is in accessControl[]
      const index = doc.accessControl.findIndex(
        (entry) => entry.wallet.toLowerCase() === normalizedTarget
      );

      if (index === -1) {
        return res.status(404).json({
          message: "Access entry not found for the provided wallet.",
        });
      }

      // Remove the entry from accessControl[]
      doc.accessControl.splice(index, 1);
      await doc.save();

      // Log audit
      await AccessAuditLog.create({
        docId,
        docModel: "CaseDocument",
        caseId: parentCase._id,
        userWallet: requesterWallet,
        userRole: req.userRole,
        action: "REVOKED",
        affectedWallet: normalizedTarget,
        timestamp: new Date(),
        notes: `Revoked access from ${normalizedTarget}`,
      });

      return res.status(200).json({
        message: "Access revoked successfully",
        revokedFrom: normalizedTarget,
      });
    } catch (err) {
      console.error("Error revoking access:", err);
      return res
        .status(500)
        .json({ message: "Server error while revoking access." });
    }
  }
);

/*
router.get("/:caseId", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();
    
    // Validate case existence
    const caseDoc = await Case.findOne({_id : caseId});
    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }
    
    const isAdmin = caseDoc.admin.toLowerCase() === wallet;
    const participant = caseDoc.participants.find(
      (p) => p.wallet.toLowerCase() === wallet
    );
    
    if (!isAdmin && !participant) {
      return res.status(403).json({ message: "You are not a participant" });
    }
    
    const canView = isAdmin || participant?.permissions?.canView;
    
    if (!canView) {
      return res
      .status(403)
        .json({ message: "You do not have view permissions for this case" });
      }
      
      const documents = await CaseDocument.find({
        caseId,
        isDeleted: false,
        accessControl: {
          $elemMatch: {
            wallet: wallet,
            canView: true,
          },
        },
      }).sort({ createdAt: -1 });
      
      if (!documents || documents.length === 0) {
        console.log("No documents found");
        return res.status(404).json({ message: "No documents found" });
      }
      
      const sanitizedDocs = documents.map((doc) => ({
        _id: doc._id,
        title: doc.title,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        ipfsCid: doc.ipfsCid,
        encrypted: doc.encrypted,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
      }));
      
      return res.status(200).json({
        message: "Documents fetched successfully",
        documents: sanitizedDocs,
        caseId,
      });
    } catch (err) {
      console.error("Error fetching case documents:", err);
      return res
      .status(500)
      .json({ message: "Server error fetching documents." });
    }
  });
  */

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  filterType: z.enum(["all", "docs", "image", "media", "other"]).default("all"),
  accessFilter: z.enum(["all", "canDelete"]).default("all"),
  sortBy: z
    .enum(["newest", "oldest", "titleAsc", "titleDesc", "sizeAsc", "sizeDesc"])
    .default("newest"),
  page: z.preprocess((val) => {
    const num = Number(val);
    return isNaN(num) ? 1 : num;
  }, z.number().int().min(1).default(1)),
  limit: z.preprocess(
    (val) => {
      const num = Number(val);
      return isNaN(num) ? 12 : num;
    },
    z
      .number()
      .int()
      .refine((val) => [12, 24, 48, 96].includes(val), {
        message: "limitOfAPage must be one of: 12, 24, 48, 96",
      })
      .default(12)
  ),
});
router.get("/:caseId", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    const parsedQuery = querySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: parsedQuery.error.format(),
      });
    }

    const { search, filterType, accessFilter, sortBy, page, limit } =
      parsedQuery.data;

    const skip = (page - 1) * limit;

    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({
        success: false,
        message: "Case not found",
      });
    }

    const isAdmin = caseDoc.admin.toLowerCase() === wallet;
    const participant = caseDoc.participants.find(
      (p) => p.wallet.toLowerCase() === wallet
    );

    if (!isAdmin && !participant) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this case",
      });
    }

    const canView = isAdmin || participant?.permissions?.canView;
    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "You do not have view permissions for this case",
      });
    }

    const query = {
      caseId,
      isDeleted: false,
      accessControl: {
        $elemMatch: {
          wallet: wallet,
          canView: true,
        },
      },
    };

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    if (filterType !== "all") {
      const mimeGroups = {
        docs: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        image: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
        media: ["video/mp4", "audio/mpeg"],
        other: ["application/zip", "application/octet-stream"],
      };
      query.fileType = { $in: mimeGroups[filterType] || [] };
    }

    if (accessFilter === "canDelete") {
      query.accessControl.$elemMatch.canDelete = true;
    }

    let sort = { createdAt: -1 }; // Default: newest first
    switch (sortBy) {
      case "oldest":
        sort = { createdAt: 1 };
        break;
      case "titleAsc":
        sort = { title: 1 };
        break;
      case "titleDesc":
        sort = { title: -1 };
        break;
      case "sizeAsc":
        sort = { fileSize: 1 };
        break;
      case "sizeDesc":
        sort = { fileSize: -1 };
        break;
    }

    const [documents, totalDocs] = await Promise.all([
      CaseDocument.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      CaseDocument.countDocuments(query),
    ]);

    const sanitizedDocs = documents.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      ipfsCid: doc.ipfsCid,
      encrypted: doc.encrypted,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt,
    }));

    const totalPages = Math.ceil(totalDocs / limit);

    return res.status(200).json({
      success: true,
      message: "Documents fetched successfully",
      documents: sanitizedDocs,
      pagination: {
        totalDocs,
        currentPage: page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        search: search || null,
        filterType,
        accessFilter,
        sortBy,
      },
    });
  } catch (err) {
    console.error("Error fetching documents:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching documents.",
      ...(process.env.NODE_ENV === "development" && { error: err.message }),
    });
  }
});

// GET /:caseId/view/:docId
router.get("/:caseId/view/:docId", authMiddleware, async (req, res) => {
  try {
    const { caseId, docId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    // Fetch case and document in parallel
    const [caseDoc, document] = await Promise.all([
      Case.findById(caseId),
      CaseDocument.findOne({ _id: docId, caseId, isDeleted: false }),
    ]);

    if (!caseDoc) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const isUserCaseAdmin = caseDoc.admin.toLowerCase() === wallet;
    const isUserDocCreator = document.uploadedBy.toLowerCase() === wallet;

    // Access control check
    const docAccess = document.accessControl.find(
      (entry) => entry.wallet.toLowerCase() === wallet
    );

    const hasUserViewAccess = docAccess?.canView || false;
    const hasUserDeleteAccess = docAccess?.canDelete || false;

    if (!hasUserViewAccess && !isUserCaseAdmin && !isUserDocCreator) {
      return res.status(403).json({
        message: "You do not have view permissions for this document",
      });
    }

    // Audit log
    await AccessAuditLog.create({
      docId: document._id,
      docModel: "CaseDocument",
      caseId: caseDoc._id,
      userWallet: wallet,
      userRole: req.userRole,
      action: "VIEWED",
    });

    // Sanitize response
    const { accessControl, __v, ...sanitizedDocument } = document.toObject();

    return res.status(200).json({
      message: "Document fetched successfully",
      sanitizedDocument,
      meta: {
        isUserCaseAdmin,
        isUserDocCreator,
        hasUserViewAccess:
          hasUserViewAccess || isUserCaseAdmin || isUserDocCreator,
        hasUserDeleteAccess:
          hasUserDeleteAccess || isUserCaseAdmin || isUserDocCreator,
        caseMeta: {
          title: caseDoc.title,
          isClosed: caseDoc.isClosed,
          caseId: caseDoc._id,
        },
      },
    });
  } catch (err) {
    console.error("Error fetching case document:", err);
    return res.status(500).json({ message: "Server error fetching document." });
  }
});

router.get("/:caseId/:docId/participants", authMiddleware, async (req, res) => {
  try {
    const { caseId, docId } = req.params;

    const document = await CaseDocument.findOne({
      _id: docId,
      caseId,
      isDeleted: false,
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const accessControl = document.accessControl || [];

    // Get unique wallets
    const wallets = accessControl.map((entry) => entry.wallet);

    // Fetch user details from User model
    const users = await User.find({ walletAddress: { $in: wallets } }).select(
      "walletAddress role phoneNumber userId employeeId"
    );

    const userMap = new Map(users.map((user) => [user.walletAddress, user]));

    // Merge accessControl with user info
    const participants = accessControl.map((entry) => {
      const wallet = entry.wallet;
      const user = userMap.get(wallet);

      return {
        wallet: entry.wallet,
        canView: entry.canView || false,
        canDelete: entry.canDelete || false,
        userId: user?.userId || null,
        employeeId: user?.employeeId || null,
        role: user?.role || "Unknown",
        phoneNumber: user?.phoneNumber || null,
      };
    });

    return res.status(200).json({
      message: "Document participants fetched successfully",
      participants,
    });
  } catch (err) {
    console.error("Error fetching document participants:", err);
    return res
      .status(500)
      .json({ message: "Server error fetching participants." });
  }
});

// ---------------- DELETE /case-doc/:docId ------------------
router.delete("/:docId", authMiddleware, async (req, res) => {
  try {
    const { docId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    // Validate document existence
    const document = await CaseDocument.findOne({
      _id: docId,
      isDeleted: false,
    });
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Find related case
    const caseData = await Case.findById(document.caseId);
    if (!caseData) {
      return res.status(404).json({ message: "Parent case not found." });
    }

    // Check access permissions
    const isAdmin = caseData.admin.toLowerCase() === wallet;
    const isUploader = document.uploadedBy.toLowerCase() === wallet;
    const hasAccess = document.accessControl.some(
      (access) => access.wallet.toLowerCase() === wallet && access.canDelete
    );

    if (!isAdmin && !isUploader && !hasAccess) {
      return res.status(403).json({
        message: "You do not have delete permissions for this document",
      });
    }

    // Soft delete the document
    document.isDeleted = true;
    await document.save();

    // Audit Log
    await AccessAuditLog.create({
      docId: document._id,
      docModel: "CaseDocument",
      caseId: document.caseId,
      userWallet: wallet,
      userRole: req.userRole,
      action: "DELETED",
    });

    return res.status(200).json({
      message: "Document deleted successfully",
      docId: document._id,
    });
  } catch (err) {
    console.error("Error deleting case document:", err);
    return res.status(500).json({ message: "Server error deleting document." });
  }
});

// -------------- GET /case-doc/:docId/logs ----------------
router.get("/:docId/logs", authMiddleware, async (req, res) => {
  try {
    const { docId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    // Validate document existence
    const document = await CaseDocument.findOne({
      _id: docId,
      isDeleted: false,
    });
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Check if the user has access to the document
    const hasAccess = document.accessControl.some(
      (access) => access.wallet.toLowerCase() === wallet && access.canView
    );

    if (!hasAccess) {
      return res.status(403).json({
        message: "You do not have view permissions for this document",
      });
    }

    // Fetch logs related to the document
    const logs = await AccessAuditLog.find({
      docId,
      docModel: "CaseDocument",
    }).sort({ timestamp: -1 });

    return res.status(200).json({
      message: "Logs fetched successfully",
      logs,
    });
  } catch (err) {
    console.error("Error fetching case document logs:", err);
    return res.status(500).json({ message: "Server error fetching logs." });
  }
});

module.exports = router;
