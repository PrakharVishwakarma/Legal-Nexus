// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CaseAccessControl {
    address public owner;

    mapping(bytes32 => mapping(address => bool)) public access;

    event AccessGranted(bytes32 indexed caseId, address indexed user);
    event AccessRevoked(bytes32 indexed caseId, address indexed user);

    mapping(bytes32 => address) public caseAdmins;

    event CaseAdminChanged(bytes32 indexed caseId, address indexed newAdmin);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can modify access");
        _;
    }

    function grantAccess(bytes32 caseId, address user) external onlyOwner {
        access[caseId][user] = true;
        emit AccessGranted(caseId, user);
    }

    function revokeAccess(bytes32 caseId, address user) external onlyOwner {
        access[caseId][user] = false;
        emit AccessRevoked(caseId, user);
    }

    function hasAccess(
        bytes32 caseId,
        address user
    ) external view returns (bool) {
        return access[caseId][user];
    }

    function transferCaseOwnership(
        bytes32 caseId,
        address newAdmin
    ) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        caseAdmins[caseId] = newAdmin;
        emit CaseAdminChanged(caseId, newAdmin);
    }
}
