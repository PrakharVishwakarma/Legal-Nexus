// /src/utils/smartContract.js

const { ethers } = require("ethers");
require("dotenv").config();

const CaseAccessControlAbi = require("../contracts/abi/CaseAccessControl.json");

// Load from .env
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY; // MUST be present in .env
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

// Provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Signer (Backend's Admin Wallet)
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// Writable Contract Instance
const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  CaseAccessControlAbi.abi,
  signer
);

// Utility: Hash the UUID to bytes32
const hashCaseId = (caseId) => ethers.id(caseId);

// Write functions
const grantAccess = async (caseId, wallet) => {
  const hashed = hashCaseId(caseId);
  const tx = await contract.grantAccess(hashed, wallet);
  await tx.wait();
  return tx.hash;
};

const revokeAccess = async (caseId, wallet) => {
  const hashed = hashCaseId(caseId);
  const tx = await contract.revokeAccess(hashed, wallet);
  await tx.wait();
  return tx.hash;
};

const transferCaseOwnership = async (caseId, newAdminWallet) => {
  const hashed = hashCaseId(caseId);
  const tx = await contract.transferCaseOwnership(hashed, newAdminWallet);
  await tx.wait();
  return tx.hash;
};

module.exports = {
  grantAccess,
  revokeAccess,
  transferCaseOwnership,
};
