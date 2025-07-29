// /src/routes/PersonalDocument/personalDocument.js

const express = require("express");
const z = require("zod");

const { authMiddleware } = require("../../Middlewares/authMw");
const PersonalDocument = require("../../Models/personalDocumentModel");
const AccessAuditLog = require("../../Models/accessAuditLogModel");

const router = express.Router();

// -------------- POST /personal-doc/upload --------------
const uploadPersonalDocSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  fileType: z.string(),
  fileSize: z.number().optional(),
  ipfsCid: z.string().min(10, "Invalid IPFS CID"),
  encrypted: z.boolean(),
});

router.post("/upload", authMiddleware, async (req, res) => {
  try {
    // Step 1: Validate input
    const parsed = uploadPersonalDocSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { title, description, fileType, fileSize, ipfsCid, encrypted } =
      parsed.data;

    const wallet = req.userWalletAddress.toLowerCase(); // Wallet of owner

    // Step 2: Create new personal document
    const newPersonalDoc = await PersonalDocument.create({
      owner: wallet,
      title,
      description,
      fileType,
      fileSize,
      ipfsCid,
      encrypted,
      sharedWith: [], // empty initially
      linkedToCaseId: null, // not linked initially
      isArchived: false,
      isDeleted: false,
    });

    // Step 3: Log the upload action (Audit)
    await AccessAuditLog.create({
      docId: newPersonalDoc._id,
      docModel: "PersonalDocument",
      userWallet: wallet,
      userRole: req.userRole,
      action: "UPLOADED",
      notes: "Personal document uploaded",
    });

    // Step 4: Respond
    return res.status(201).json({
      message: "Personal document uploaded successfully",
      docId: newPersonalDoc._id,
    });
  } catch (err) {
    console.error("Upload Personal Document Error:", err);
    return res.status(500).json({ message: "Server error during upload." });
  }
});

// ---------------- GET /personal-doc/owned ------------------
router.get("/owned", authMiddleware, async (req, res) => {
  try {
    const wallet = req.userWalletAddress.toLowerCase();

    const personalDocs = await PersonalDocument.find({
      owner: wallet,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!personalDocs || personalDocs.length === 0) {
      return res.status(404).json({
        message: "No personal documents found",
        personalDocuments: [],
      });
    }

    const sanitizedDocs = personalDocs.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      description: doc.description,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      encrypted: doc.encrypted,
      ipfsCid: doc.ipfsCid,
      createdAt: doc.createdAt,
    }));

    return res.status(200).json({
      message: "Personal documents fetched successfully",
      personalDocuments: sanitizedDocs,
    });
  } catch (err) {
    console.error("Error fetching personal documents:", err);
    return res.status(500).json({
      message: "Server error while fetching personal documents",
    });
  }
});

// ---------------- GET /personal-doc/shared ------------------
router.get("/shared", authMiddleware, async (req, res) => {
  try {
    const wallet = req.userWalletAddress.toLowerCase();

    // Query PersonalDocument for shared docs
    const sharedDocuments = await PersonalDocument.find({
      sharedWith: { $elemMatch: { wallet: wallet } },
      isDeleted: false,
    })
      .select(
        "_id title description fileType fileSize ipfsCid encrypted owner sharedWith"
      )
      .sort({ createdAt: -1 })
      .lean();

    if (!sharedDocuments || sharedDocuments.length === 0) {
      return res.status(404).json({
        message: "No shared documents found",
        sharedDocuments: [],
      });
    }

    // 🔥 Map to clean response
    const mappedDocuments = sharedDocuments.map((doc) => {
      const sharedEntry = doc.sharedWith.find(
        (entry) => entry.wallet.toLowerCase() === wallet
      );
      return {
        _id: doc._id,
        title: doc.title,
        description: doc.description,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        ipfsCid: doc.ipfsCid,
        encrypted: doc.encrypted,
        owner: doc.owner,
        sharedAt: sharedEntry?.sharedAt || doc.createdAt,
      };
    });

    return res.status(200).json({
      message: "Shared documents fetched successfully",
      sharedDocuments: mappedDocuments,
    });
  } catch (err) {
    console.error("Error fetching shared documents:", err);
    return res
      .status(500)
      .json({ message: "Server error fetching shared documents." });
  }
});

// -------------- POST /personal-doc/share --------------
const sharePersonalDocSchema = z.object({
  docId: z.string().length(24, "Invalid Document ID format"),
  targetWallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum wallet address"),
});

router.post("/share", authMiddleware, async (req, res) => {
  try {
    // Step 1: Validate Request Body
    const parsed = sharePersonalDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { docId, targetWallet } = parsed.data;
    const userWallet = req.userWalletAddress.toLowerCase();

    // Step 2: Find Personal Document
    const personalDoc = await PersonalDocument.findOne({
      _id: docId,
      isDeleted: false,
    });

    if (!personalDoc) {
      return res.status(404).json({ message: "Document not found or deleted" });
    }

    // Step 3: Verify Ownership
    if (personalDoc.owner.toLowerCase() !== userWallet) {
      return res
        .status(403)
        .json({ message: "You are not the owner of this document" });
    }

    // Step 4: Check if already shared
    const alreadyShared = personalDoc.sharedWith.some(
      (entry) => entry.wallet.toLowerCase() === targetWallet.toLowerCase()
    );

    if (alreadyShared) {
      return res
        .status(409)
        .json({ message: "Document already shared with this wallet" });
    }

    // Step 5: Share Document
    personalDoc.sharedWith.push({
      wallet: targetWallet.toLowerCase(),
      sharedAt: new Date(),
    });

    await personalDoc.save();

    // Step 6: Audit Logging (Optional Enhancement)
    await AccessAuditLog.create({
      docId: personalDoc._id,
      docModel: "PersonalDocument",
      userWallet: userWallet,
      userRole: req.userRole,
      action: "SHARED",
      notes: `Shared with ${targetWallet}`,
      ipAddress: req.ip || null,
    });

    return res.status(200).json({
      message: "Document shared successfully",
      docId: personalDoc._id,
      sharedWith: targetWallet.toLowerCase(),
    });
  } catch (err) {
    console.error("Error sharing personal document:", err);
    return res
      .status(500)
      .json({ message: "Server error while sharing document" });
  }
});

// ---------------- POST /personal-doc/unshare ------------------
const unsharePersonalDocSchema = z.object({
  docId: z.string().length(24, "Invalid Document ID format"),
  targetWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum wallet address"),
});

router.post("/unshare", authMiddleware, async (req, res) => {
  try {
    const parsed = unsharePersonalDocSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid input", 
        errors: parsed.error.errors 
      });
    }

    const { docId, targetWallet } = parsed.data;
    const userWallet = req.userWalletAddress.toLowerCase();

    // Step 1: Fetch document
    const document = await PersonalDocument.findOne({ 
      _id: docId, 
      isDeleted: false 
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Step 2: Ensure the user is the owner
    if (document.owner.toLowerCase() !== userWallet) {
      return res.status(403).json({ message: "Only the owner can unshare the document" });
    }

    // Step 3: Check if targetWallet exists in sharedWith
    const wasShared = document.sharedWith.some(
      (entry) => entry.wallet.toLowerCase() === targetWallet.toLowerCase()
    );

    if (!wasShared) {
      return res.status(400).json({ message: "Document was not shared with this wallet" });
    }

    // Step 4: Pull from sharedWith array
    document.sharedWith = document.sharedWith.filter(
      (entry) => entry.wallet.toLowerCase() !== targetWallet.toLowerCase()
    );

    await document.save();

    // Step 5 (Optional): Audit Logging
    await AccessAuditLog.create({
      docId: document._id,
      docModel: "PersonalDocument",
      userWallet: userWallet,
      userRole: req.userRole,
      action: "UNSHARED",
      notes: `Unshared personal document with ${targetWallet}`,
    });

    return res.status(200).json({
      message: "Document unshared successfully",
      unsharedWith: targetWallet.toLowerCase(),
      docId: document._id,
    });

  } catch (err) {
    console.error("Error unsharing personal document:", err);
    return res.status(500).json({ message: "Server error during unshare." });
  }
});


// ------------------ POST /personal-doc/delete ------------------
const deletePersonalDocSchema = z.object({
  docId: z.string().length(24, "Invalid MongoDB ObjectId"), // Mongo ID validation
});

router.post("/delete", authMiddleware, async (req, res) => {
  try {
    // Step 1: Validate input
    const parsed = deletePersonalDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.errors,
      });
    }

    const { docId } = parsed.data;
    const userWallet = req.userWalletAddress.toLowerCase();

    // Step 2: Find document
    const document = await PersonalDocument.findOne({
      _id: docId,
      isDeleted: false,
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Step 3: Check ownership
    if (document.owner.toLowerCase() !== userWallet) {
      return res.status(403).json({
        message: "Only the document owner can delete it",
      });
    }

    // Step 4: Soft delete
    document.isDeleted = true;
    await document.save();

    // Step 5: Create Access Audit Log
    await AccessAuditLog.create({
      docId: document._id,
      docModel: "PersonalDocument",
      userWallet: userWallet,
      userRole: req.userRole,
      action: "DELETED",
      notes: "Personal document deleted by owner",
      ipAddress: req.ip || null,
    });

    // Step 6: Respond
    return res.status(200).json({
      message: "Document deleted successfully",
      docId: document._id,
    });
  } catch (err) {
    console.error("Error deleting personal document:", err);
    return res.status(500).json({ message: "Server error while deleting document" });
  }
});


// ------------------ GET /personal-doc/:docId/logs ------------------
const mongoose = require("mongoose");

router.get("/:docId/logs", authMiddleware, async (req, res) => {
  try {
    const { docId } = req.params;
    const userWallet = req.userWalletAddress.toLowerCase();

    // Step 1: Validate docId format
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return res.status(400).json({
        message: "Invalid document ID format.",
      });
    }

    // Step 2: Fetch the document
    const personalDoc = await PersonalDocument.findOne({
      _id: docId,
      isDeleted: false,
    });

    if (!personalDoc) {
      return res.status(404).json({
        message: "Personal document not found or deleted.",
      });
    }

    // Step 3: Access control (owner or shared user)
    const isOwner = personalDoc.owner.toLowerCase() === userWallet;
    const isShared = personalDoc.sharedWith.some(
      (entry) => entry.wallet.toLowerCase() === userWallet
    );

    if (!isOwner && !isShared) {
      return res.status(403).json({
        message: "You do not have permission to view logs for this document.",
      });
    }

    // Step 4: Fetch logs
    const logs = await AccessAuditLog.find({
      docId,
      docModel: "PersonalDocument",
    })
      .sort({ timestamp: -1 })
      .lean();

    if (!logs || logs.length === 0) {
      return res.status(404).json({
        message: "No logs found for this document.",
        logs: [],
      });
    }

    // Step 5: Send response
    return res.status(200).json({
      message: "Logs fetched successfully.",
      logs,
    });
  } catch (err) {
    console.error("Error fetching personal document logs:", err);
    return res.status(500).json({
      message: "Server error while fetching document logs.",
    });
  }
});


module.exports = router;