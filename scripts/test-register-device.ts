import * as fs from "fs";
import * as path from "path";
import admin from "firebase-admin";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
    }
  }
}

const pk = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!admin.apps.length && pk) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "prysmor-4841d",
      clientEmail:
        "firebase-adminsdk-fbsvc@prysmor-4841d.iam.gserviceaccount.com",
      privateKey: pk,
    }),
  });
}

// registerDevice uses @/lib/firebaseAdmin — set env before dynamic import
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY ?? pk;

async function main() {
  const { registerDevice } = await import("../lib/firestore/devices");
  const USER_ID = "user_3DKBB8RmA62zhYsiHYHr7Fta9aT";
  const id = await registerDevice(
    USER_ID,
    `panel-${USER_ID}-hzpadf`,
    "macOS",
    "PPRO test",
    { hostApp: "PPRO", machineFingerprint: "mfp-hzpadf" }
  );
  console.log("OK merged into", id);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
