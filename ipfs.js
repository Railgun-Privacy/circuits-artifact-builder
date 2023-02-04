async function createIPFS() {
  const IPFS = await import("ipfs-http-client");
  return IPFS.create({
    url: process.env.IPFS_API || "http://127.0.0.1:5001/api/v0",
  });
}

const ipfs = createIPFS();

module.exports = ipfs;
