// /src/Models/caseDocumentModel.js

const mongoose = require("mongoose");

const caseDocumentSchema = new mongoose.Schema(
  { 
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      required: true,
    },
    uploadedBy: {
      type: String,
      required: true,
      match: /^0x[a-fA-F0-9]{40}$/,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
    },
    ipfsCid: {
      type: String,
      required: true,
    },
    encrypted: {
      type: Boolean,
      default: false,
    },
    accessControl: [
      {
        wallet: {
          type: String,
          match: /^0x[a-fA-F0-9]{40}$/,
          required: true,
          index: true,
        },
        canView: {
          type: Boolean,
          default: true,
        },
        canDelete: {
          type: Boolean,
          default: false,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const CaseDocument = mongoose.model("CaseDocument", caseDocumentSchema);
module.exports = CaseDocument;
