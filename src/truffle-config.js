module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,     // Ganache default
      network_id: "*"
    }
  },
  compilers: {
    solc: {
      version: "0.8.20"
    }
  }
};
