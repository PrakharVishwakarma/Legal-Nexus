// /src/routes/CaseDocument/caseDocument.js
const express = require("express");
const Case = require("../../Models/caseModel");
const CaseDocument = require("../../Models/caseDocumentModel");
const AccessAuditLog = require("../../Models/accessAuditLogModel");
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

    const wallet = req.userWalletAddress.toLowerCase();
    const isAdmin = caseDoc.admin.toLowerCase() === wallet;

    const participant = caseDoc.participants.find(
      (p) => p.wallet.toLowerCase() === wallet
    );

    const canUpload = isAdmin || participant?.permissions?.canUpload;

    if (!canUpload) {
      return res
        .status(403)
        .json({ message: "You do not have upload permissions for this case" });
    }

    // Ensure uploader has full access
    const completeAccessControl = [
      ...accessControl,
      {
        wallet,
        canView: true,
        canDelete: true,
      },
    ];
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

// ------------ PATCH /case-doc/:docId/grant-access ------------
const grantAccessSchema = z.object({
  targetWallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  permissions: z.object({
    canView: z.boolean().optional(),
    canDelete: z.boolean().optional(),
  }),
});
router.patch("/:docId/grant-access", authMiddleware, async (req, res) => {
  try {
    const { docId } = req.params;
    const userWallet = req.userWalletAddress.toLowerCase();

    const parsed = grantAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid input", errors: parsed.error.errors });
    }
    const { targetWallet, permissions } = parsed.data;
    const { canView = false, canDelete = false } = permissions;

    // Step 1: Find document
    const doc = await CaseDocument.findById(docId);
    if (!doc || doc.isDeleted) {
      return res
        .status(404)
        .json({ message: "Document not found or deleted." });
    }

    // Step 2: Get parent case
    const caseData = await Case.findById(doc.caseId);
    if (!caseData) {
      return res.status(404).json({ message: "Parent case not found." });
    }

    // Step 3: Verify requester is admin
    if (caseData.admin.toLowerCase() !== userWallet) {
      return res
        .status(403)
        .json({ message: "Only case admin can grant access." });
    }

    // Step 4: Check if targetWallet is a participant in the case
    const isParticipant = caseData.participants.some(
      (p) => p.wallet.toLowerCase() === targetWallet.toLowerCase()
    );

    if (!isParticipant) {
      return res
        .status(400)
        .json({ message: "Target wallet is not a case participant." });
    }

    // Step 5: Update or add accessControl entry
    const idx = doc.accessControl.findIndex(
      (entry) => entry.wallet.toLowerCase() === targetWallet.toLowerCase()
    );

    if (idx !== -1) {
      // Update existing permissions
      doc.accessControl[idx].canView = canView;
      doc.accessControl[idx].canDelete = canDelete;
    } else {
      // Add new access control entry
      doc.accessControl.push({
        wallet: targetWallet.toLowerCase(),
        canView,
        canDelete,
      });
    }

    await doc.save();

    await AccessAuditLog.create({
      docId: doc._id,
      docModel: "CaseDocument",
      caseId: doc.caseId,
      userWallet: userWallet,
      userRole: req.userRole,
      action: "SHARED",
      notes: `Granted ${canView ? "view" : ""}${
        canView && canDelete ? " & " : ""
      }${canDelete ? "delete" : ""} to ${targetWallet}`,
      ipAddress: req.ip || null,
    });

    return res.status(200).json({
      message: "Access granted successfully",
      grantedTo: targetWallet.toLowerCase(),
      permissions: { canView, canDelete },
    });
  } catch (err) {
    console.error("Error granting access:", err);
    return res
      .status(500)
      .json({ message: "Server error while granting access." });
  }
});

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

router.get("/:caseId", authMiddleware, async (req, res) => {
  try {
    const { caseId } = req.params;
    const wallet = req.userWalletAddress.toLowerCase();

    // Validate case existence
    const caseDoc = await Case.findOne({ _id: caseId });
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

// ---------------- GET /case-doc/:docId/view ------------------
router.get("/:docId/view", authMiddleware, async (req, res) => {
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

    // Check access permissions
    const hasAccess = document.accessControl.some(
      (access) => access.wallet.toLowerCase() === wallet && access.canView
    );

    if (!hasAccess) {
      return res.status(403).json({
        message: "You do not have view permissions for this document",
      });
    }

    // Audit Log
    await AccessAuditLog.create({
      docId: document._id,
      docModel: "CaseDocument",
      caseId: document.caseId,
      userWallet: wallet,
      userRole: req.userRole,
      action: "VIEWED",
    });

    // Step 5: Sanitize and respond
    const { accessControl, __v, ...sanitizedDocument } = document.toObject();

    return res.status(200).json({
      message: "Document fetched successfully",
      sanitizedDocument,
    });
  } catch (err) {
    console.error("Error fetching case document:", err);
    return res.status(500).json({ message: "Server error fetching document." });
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
    const hasAccess = document.accessControl.some(
      (access) => access.wallet.toLowerCase() === wallet && access.canDelete
    );

    if (!isAdmin && !hasAccess) {
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