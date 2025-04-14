const CaseAccessControl = artifacts.require("CaseAccessControl");

module.exports = function (deployer) {
  deployer.deploy(CaseAccessControl);
};
