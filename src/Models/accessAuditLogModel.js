// /src/Models/accessAuditLogModel.js

const mongoose = require("mongoose");

const accessAuditLogSchema = new mongoose.Schema(
  {
    docId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'docModel'
    },

    // Dynamically reference either case or personal document
    docModel: {
      type: String,
      required: true,
      enum: ["CaseDocument", "PersonalDocument"]
    },

    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      default: null
    },

    userWallet: {
      type: String,
      required: true,
      match: /^0x[a-fA-F0-9]{40}$/
    },

    userRole: {
      type: String,
      enum: ["Judge", "Lawyer", "Police", "Civilian"],
      required: true
    },

    action: {
      type: String,
      enum: ["VIEWED", "SHARED", "REVOKED", "UPLOADED", "DOWNLOADED", "UNSHARED", "DELETED", "EDITED"],
      required: true
    },

    timestamp: {
      type: Date,
      default: Date.now
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500
    },

    ipAddress: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const AccessAuditLog = mongoose.model("AccessAuditLog", accessAuditLogSchema);

module.exports = AccessAuditLog;
