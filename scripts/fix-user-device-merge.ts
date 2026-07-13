/**
 * One-off: merge PR+AE seat for brzotrcipuska7@gmail.com (simulate post-fix registerDevice).
 */
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

const USER_ID = "user_3DKBB8RmA62zhYsiHYHr7Fta9aT";

async function main() {
  const db = admin.firestore();
  const ref = db
    .collection("users")
    .doc(USER_ID)
    .collection("devices")
    .doc(`panel-${USER_ID}-h7q7uo`);

  await ref.update({
    hostApps: admin.firestore.FieldValue.arrayUnion("PPRO"),
    lastActive: new Date(),
  });
  console.log("Updated device", ref.id, "with PPRO in hostApps");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
