// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CaseAccessControl {
    address public owner;

    struct CaseMetadata {
        address admin;
        bool isClosed;
    }

    mapping(bytes32 => CaseMetadata) public cases;
    mapping(bytes32 => mapping(address => bool)) public access;

    event AccessGranted(bytes32 indexed caseId, address indexed user);
    event AccessRevoked(bytes32 indexed caseId, address indexed user);
    event CaseRegistered(bytes32 indexed caseId, address indexed admin);
    event CaseClosed(bytes32 indexed caseId);
    event CaseAdminChanged(bytes32 indexed caseId, address indexed newAdmin);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can modify access");
        _;
    }

    modifier onlyCaseAdmin(bytes32 caseId) {
        require(cases[caseId].admin == msg.sender, "Only case admin allowed");
        _;
    }

    function registerCase(bytes32 caseId, address admin) external onlyOwner {
        require(admin != address(0), "Invalid admin address");
        require(cases[caseId].admin == address(0), "Case already registered");

        cases[caseId] = CaseMetadata({admin: admin, isClosed: false});

        emit CaseRegistered(caseId, admin);
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
        require(cases[caseId].admin != address(0), "Case not registered");
        cases[caseId].admin = newAdmin;
        emit CaseAdminChanged(caseId, newAdmin);
    }

    function closeCase(bytes32 caseId) external onlyOwner {
        require(cases[caseId].admin != address(0), "Case not registered");
        require(!cases[caseId].isClosed, "Case already closed");
        cases[caseId].isClosed = true;
        emit CaseClosed(caseId);
    }
}
