const mongoose = require("mongoose");

const sharedWithSchema = new mongoose.Schema({
  wallet: {
    type: String,
    required: true,
    match: /^0x[a-fA-F0-9]{40}$/
  },
  sharedAt: {
    type: Date,
    default: Date.now
  }
});

const personalDocumentSchema = new mongoose.Schema(
  {
    owner: {
      type: String, // Wallet address
      required: true,
      match: /^0x[a-fA-F0-9]{40}$/,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    fileType: {
      type: String,
      required: true
    },

    fileSize: {
      type: Number
    },

    ipfsCid: {
      type: String,
      required: true
    },

    encrypted: {
      type: Boolean,
      default: false
    },

    sharedWith: [sharedWithSchema],

    linkedToCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      default: null
    },

    isArchived: {
      type: Boolean,
      default: false
    },

    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

const PersonalDocument = mongoose.model("PersonalDocument", personalDocumentSchema);
module.exports = PersonalDocument;
