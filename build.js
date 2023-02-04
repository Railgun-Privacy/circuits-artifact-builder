const fs = require("fs-extra");
const brotli = require("brotli");
const snarkJS = require("snarkjs");
const { keccak_256 } = require("@noble/hashes/sha3");
const getIPFS = require("./ipfs");

const compressionQuality = 11;

const ceremonyOutput = "QmWAySHYhaZqioKi1ufrPJC1n1ZVtHP2w4hLA9XqqJCFne";

const beaconBlockHashes = [
  "3dc4ef568ae2635db1419c5fec55c4a9322c05302ae527cd40bff380c1d465dd", // 16000000
  "a0d3047ae848d2dab629995b98c68cfed076e6a1d1abd2c9487215f6d955d461", // 16050000
  "5724e7710e27754b3e6042b3cab7ceee6f24a1ecaddd79daca8cb3ad5492d456", // 16100000
  "c7ac3b2f9796dc25a55ccf0cac1c28424c7caadf5b5668179893bec164259d98", // 16150000
  "075dfe48c8c85c495ecebc5509d0dd0c1ce416341dd619fc63d61f4ed6cfe2f6", // 16200000
  "e2dcf02fb09fdd316c35539b24cd3ef3e4624ca8dde92fd19dcc35035ecbcdb8", // 16250000
  "4dc9f7ad4a2c21699c6b31a2deea8b48731197e86855e2d7675e1866efafc665", // 16300000
  "795828f93914ef187df13eb6bf3d06f25269e623dbaed16813616ba663c35eb6", // 16350000
  "c5e38d714ec3569c34fcf4cfd5808fce67cce0c6dcb1d9c4a0e3e9e3e66cac1c", // 16400000
];

async function getIPFSFile(ipfs, path) {
  const chunks = [];

  for await (const chunk of ipfs.cat(path)) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function solidityFormatVKey(vkey, artifactsIPFSHash) {
  return {
    artifactsIPFSHash,
    alpha1: {
      x: vkey.vk_alpha_1[0],
      y: vkey.vk_alpha_1[1],
    },
    beta2: {
      x: [vkey.vk_beta_2[0][1], vkey.vk_beta_2[0][0]],
      y: [vkey.vk_beta_2[1][1], vkey.vk_beta_2[1][0]],
    },
    gamma2: {
      x: [vkey.vk_gamma_2[0][1], vkey.vk_gamma_2[0][0]],
      y: [vkey.vk_gamma_2[1][1], vkey.vk_gamma_2[1][0]],
    },
    delta2: {
      x: [vkey.vk_delta_2[0][1], vkey.vk_delta_2[0][0]],
      y: [vkey.vk_delta_2[1][1], vkey.vk_delta_2[1][0]],
    },
    ic: vkey.IC.map((icEl) => ({
      x: icEl[0],
      y: icEl[1],
    })),
  };
}

async function main() {
  console.log("CONNECTING TO IPFS");
  const ipfs = await getIPFS;

  console.log("\nDOWNLOADING CEREMONY OUTPUT");
  console.log(`Pinning ${ceremonyOutput} as 'Ceremony Output'`);
  await ipfs.pin.add(ceremonyOutput, {
    name: "Ceremony Output",
  });

  console.log("\nCALCULATING BEACON");
  const beaconPreimage = Buffer.concat(
    beaconBlockHashes.map((block) => Buffer.from(block, "hex"))
  );
  const beacon = Buffer.from(keccak_256(beaconPreimage)).toString("hex");
  console.log(`Beacon: ${beacon}`);

  console.log("\nCREATING DIRECTORIES");
  console.log("Deleting old build directories...");
  await fs.remove(`${__dirname}/build`);
  await fs.remove(`${__dirname}/module`);
  console.log("Creating fresh build directories...");
  await fs.mkdir(`${__dirname}/build`);
  await fs.mkdir(`${__dirname}/module`);

  console.log("\nREADING CIRCUITS");
  const r1csFiles = [];
  for await (const entry of ipfs.ls(`${ceremonyOutput}/r1cs`)) {
    r1csFiles.push(entry.name);
  }

  const circuits = r1csFiles.map((record) => {
    const splitName = record.split("x");

    const circuit = {
      nullifiers: parseInt(splitName[0]),
      commitments: parseInt(splitName[1]),
    };

    console.log(
      `Found circuit with ${circuit.nullifiers} nullifiers and ${circuit.commitments} commitments`
    );

    return circuit;
  });

  console.log("\nPROCESSING CIRCUITS");
  const vKeys = [];
  for (let i = 0; i < circuits.length; i += 1) {
    console.log(
      `Creating directory for ${circuits[i].nullifiers}x${circuits[i].commitments}`
    );
    await fs.mkdir(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}`
    );

    console.log(
      `Applying beacon to ${circuits[i].nullifiers}x${circuits[i].commitments}`
    );
    await snarkJS.zKey.beacon(
      await getIPFSFile(
        ipfs,
        `${ceremonyOutput}/zkeys/${circuits[i].nullifiers}x${circuits[i].commitments}.zkey`
      ),
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey`,
      "Beacon",
      beacon,
      10
    );

    console.log(
      `Copying r1cs for ${circuits[i].nullifiers}x${circuits[i].commitments}`
    );
    await fs.writeFile(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/r1cs`,
      await getIPFSFile(
        ipfs,
        `${ceremonyOutput}/r1cs/${circuits[i].nullifiers}x${circuits[i].commitments}.r1cs`
      )
    );

    console.log(
      `Compressing artifacts for ${circuits[i].nullifiers}x${circuits[i].commitments}`
    );
    await fs.writeFile(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey.br`,
      Buffer.from(
        brotli.compress(
          await fs.readFile(
            `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey`
          ),
          { quality: compressionQuality }
        )
      )
    );
    await fs.writeFile(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/r1cs.br`,
      Buffer.from(
        brotli.compress(
          await fs.readFile(
            `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/r1cs`
          ),
          { quality: compressionQuality }
        )
      )
    );

    console.log(
      `Exporting vkey for ${circuits[i].nullifiers}x${circuits[i].commitments}`
    );
    vKeys[i] = await snarkJS.zKey.exportVerificationKey(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey`
    );
    await fs.writeFile(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/vkey.json`,
      JSON.stringify(vKeys[i], null, 2)
    );

    console.log("");
  }

  console.log("\nADDING TO IPFS");
  const ipfsHashes = [];

  const allFiles = [];

  for (let i = 0; i < circuits.length; i += 1) {
    console.log(
      `Adding ${circuits[i].nullifiers}x${circuits[i].commitments} to IPFS`
    );

    const artifactFiles = [
      "zkey",
      "zkey.br",
      "r1cs",
      "r1cs.br",
      "vkey.json",
    ].map((fileName) => ({
      path: fileName,
      content: fs.readFileSync(
        `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/${fileName}`
      ),
      mtime: new Date(0),
    }));

    artifactFiles.forEach((file) => {
      allFiles.push({
        path: `${circuits[i].nullifiers}x${circuits[i].commitments}/${file.path}`,
        content: file.content,
        mtime: file.mtime,
      });
    });

    let lastEntry = {};
    for await (const entry of ipfs.addAll(artifactFiles, {
      wrapWithDirectory: true,
    })) {
      lastEntry = entry;
    }
    ipfsHashes[i] = lastEntry.cid.toString();
    console.log(ipfsHashes[i]);
    console.log("");
  }

  console.log("Adding parent folder to IPFS");
  let lastEntry = {};
  for await (const entry of ipfs.addAll(allFiles, {
    wrapWithDirectory: true,
  })) {
    lastEntry = entry;
  }
  console.log(`Parent Folder: ${lastEntry.cid.toString()} (pin this)`);

  console.log("\nWRITING DEPLOYMENT CONFIG");
  const deploymentConfig = circuits.map((circuit, i) => ({
    nullifiers: circuit.nullifiers,
    commitments: circuit.commitments,
    contractVKey: solidityFormatVKey(vKeys[i], ipfsHashes[i]),
  }));
  await fs.writeFile(
    `${__dirname}/build/deploymentConfig.json`,
    JSON.stringify(deploymentConfig, null, 2)
  );

  if (!(await fs.exists(`${__dirname}/circom_output`))) {
    console.log(
      "Circom artifacts not found, exiting after building IPFS files"
    );
    console.log(
      "To build additional modules place the circom compiler output in ./circom_output"
    );
    console.log(
      "Running 'circom $FILE --wasm' on each circuit will generate these"
    );
    process.exit();
  }

  console.log("\nBUILDING NPM PACKAGE");

  let requiresString =
    "const fs = require('fs');\nconst decompress = require('brotli/decompress');";
  const exportObject = [];

  for (let i = 0; i < circuits.length; i += 1) {
    console.log(
      `\nBuilding ${circuits[i].nullifiers}x${circuits[i].commitments}`
    );

    console.log("Creating folders");
    await fs.mkdir(
      `${__dirname}/module/${circuits[i].nullifiers}x${circuits[i].commitments}`
    );

    console.log("Copying vkey");
    await fs.copyFile(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/vkey.json`,
      `${__dirname}/module/${circuits[i].nullifiers}x${circuits[i].commitments}/vkey.json`
    );

    console.log("Copying zkey");
    await fs.copyFile(
      `${__dirname}/build/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey.br`,
      `${__dirname}/module/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey.br`
    );

    console.log("Compressing and copying WASM");
    await fs.writeFile(
      `${__dirname}/module/${circuits[i].nullifiers}x${circuits[i].commitments}/wasm.br`,
      Buffer.from(
        brotli.compress(
          await fs.readFile(
            `${__dirname}/circom_output/joinsplit_${circuits[i].nullifiers}x${circuits[i].commitments}_js/joinsplit_${circuits[i].nullifiers}x${circuits[i].commitments}.wasm`
          ),
          { quality: compressionQuality }
        )
      )
    );

    console.log("Adding to file templates");
    requiresString += `\nconst zkey${circuits[i].nullifiers}s${circuits[i].commitments} = decompress(fs.readFileSync(\`\${__dirname}/${circuits[i].nullifiers}x${circuits[i].commitments}/zkey.br\`));`;
    requiresString += `\nconst wasm${circuits[i].nullifiers}s${circuits[i].commitments} = decompress(fs.readFileSync(\`\${__dirname}/${circuits[i].nullifiers}x${circuits[i].commitments}/wasm.br\`));`;
    requiresString += `\nconst vkey${circuits[i].nullifiers}s${circuits[i].commitments} =require('./${circuits[i].nullifiers}x${circuits[i].commitments}/vkey');`;
    if (!exportObject[circuits[i].nullifiers]) {
      exportObject[circuits[i].nullifiers] = [];
    }
    exportObject[circuits[i].nullifiers][circuits[i].commitments] = true;
  }

  let exportString = "const exportObject = [\n";
  let typeString = "[\n";

  for (let nullifiers = 0; nullifiers < exportObject.length; nullifiers += 1) {
    if (exportObject[nullifiers]) {
      typeString += "  [\n";
      exportString += "  [\n";

      for (
        let commitments = 0;
        commitments < exportObject[nullifiers].length;
        commitments += 1
      ) {
        if (exportObject[nullifiers][commitments]) {
          typeString += "    Artifact,\n";
          exportString += `    {zkey: zkey${nullifiers}s${commitments}, wasm: wasm${nullifiers}s${commitments}, vkey: vkey${nullifiers}s${commitments}},\n`;
        } else {
          typeString += "    null,\n";
          exportString += "    null,\n";
        }
      }

      typeString += "  ],\n";
      exportString += "  ],\n";
    } else {
      typeString += "  null,\n";
      exportString += "  null,\n";
    }
  }

  typeString += ']';
  exportString += '];\n\nmodule.exports = exportObject;';

  const typings = `export type Protocols = 'groth16';
export type Curves = 'bn128';
  
export interface VKey {
  protocol: Protocols,
  curve: Curves,
  nPublic: number,
  vk_alpha_1: string[],
  vk_beta_2: string[][],
  vk_gamma_2: string[][],
  vk_delta_2: string[][],
  vk_alphabeta_12: string[][],
  IC: string[][],
}

export interface Artifact {
  zkey: Uint8Array,
  wasm: Uint8Array,
  vkey: VKey,
}

export type ArtifactList = ${typeString};

declare const artifactsList: ArtifactList;

export = artifactsList;
`;

  console.log("\nWriting exports files...");
  fs.writeFileSync(
    `${__dirname}/module/index.js`,
    `${requiresString}\n\n${exportString}\n`
  );

  console.log("\nWriting types...");
  fs.writeFileSync(`${__dirname}/module/index.d.ts`, typings);

  console.log("\nCopying package.json files...");
  fs.copyFileSync(
    `${__dirname}/package-npm-template.json`,
    `${__dirname}/module/package.json`
  );

  process.exit();
}

main();
