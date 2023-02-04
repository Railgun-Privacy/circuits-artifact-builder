# Circuit Artifacts Builder

## How to use:
- Clone and `npm install`
- Ensure an [IPFS Kubo](https://github.com/ipfs/kubo) node is running locally on your system
- Verify `ceremonyOutput` and `beaconBlockHashes` at top of build.js are accurate
- Run `node build.js`
  - By default the script will attempt to connect to the IPFS HTTP API at `http://localhost:5001/api/v0`, to override this set the IPFS_API environment variable
  - To run at a lower compression quality for testing set the COMPRESSION_QUALITY environment variable
