const fs = require("fs");
const { execSync } = require("child_process");
const os = require("os");
const selfsigned = require("selfsigned");

// Get the local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

const localIP = getLocalIP();

console.log("🔐 Generating SSL certificates...");
console.log(`📱 Using IP: ${localIP}`);

try {
  // Try to use OpenSSL if available
  const opensslCmd = `openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout key.pem -out cert.pem -subj "/CN=${localIP}" -addext "subjectAltName=IP:${localIP},IP:127.0.0.1,DNS:localhost"`;

  execSync(opensslCmd, { stdio: "inherit" });
  console.log("✅ SSL certificates created successfully!");
  console.log("   - cert.pem");
  console.log("   - key.pem");
  console.log("\n🚀 You can now start the server with: npm start");
} catch (error) {
  // Fallback: Use selfsigned package
  console.log("⚠️  OpenSSL not found. Using selfsigned package...");

  const attrs = [{ name: "commonName", value: localIP }];
  const options = {
    keySize: 2048,
    days: 365,
    algorithm: "sha256",
    extensions: [
      {
        name: "basicConstraints",
        cA: true,
      },
      {
        name: "keyUsage",
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: "subjectAltName",
        altNames: [
          {
            type: 7, // IP
            ip: localIP,
          },
          {
            type: 7, // IP
            ip: "127.0.0.1",
          },
          {
            type: 2, // DNS
            value: "localhost",
          },
        ],
      },
    ],
  };

  const pems = selfsigned.generate(attrs, options);

  // Write files
  fs.writeFileSync("key.pem", pems.private);
  fs.writeFileSync("cert.pem", pems.cert);

  console.log("✅ SSL certificates created successfully!");
  console.log("   - cert.pem");
  console.log("   - key.pem");
  console.log("\n🚀 You can now start the server with: npm start");
  console.log("\n⚠️  Note: You may see a security warning in your browser.");
  console.log(
    '   This is normal for self-signed certificates. Click "Advanced" and "Proceed".'
  );
}
