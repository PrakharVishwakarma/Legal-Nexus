// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CaseAccessControl {
    address public owner;

    mapping(bytes32 => address[]) private caseAccessMap;

    constructor() {
        owner = msg.sender;
    }

    function grantAccess(bytes32 caseId, address user) public {
        require(msg.sender == owner, "Only owner can grant access");
        caseAccessMap[caseId].push(user);
    }

    function hasAccess(bytes32 caseId, address user) public view returns (bool) {
        address[] memory users = caseAccessMap[caseId];
        for (uint i = 0; i < users.length; i++) {
            if (users[i] == user) return true;
        }
        return false;
    }
}
