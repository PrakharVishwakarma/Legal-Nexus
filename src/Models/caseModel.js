// /src/Models/caseModel.js

const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
  wallet: {
    type: String,
    required: true,
    match: /^0x[a-fA-F0-9]{40}$/,
  },
  role: {
    type: String,
    enum: ["Judge", "Lawyer", "Police", "Civilian"],
    required: true,
  },
  permissions: {
    canView: {
      type: Boolean,
      default: true,
    },
    canUpload: {
      type: Boolean,
      default: false,
    },
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const caseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    courtName: {
      type: String,
    },
    createdBy: {
      type: String, // wallet address
      required: true,
      match: /^0x[a-fA-F0-9]{40}$/,
    },
    admin: {
      type: String, // Ethereum wallet of the current admin
      required: true,
    },
    adminHistory: [
      {
        wallet: String,
        changedAt: Date,
      },
    ],
    participants: [participantSchema],
    isClosed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Case = mongoose.model("Case", caseSchema);
module.exports = Case;
