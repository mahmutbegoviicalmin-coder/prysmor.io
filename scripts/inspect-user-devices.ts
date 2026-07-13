/**
 * Inspect Firestore user + devices by email.
 * Run: npx tsx scripts/inspect-user-devices.ts brzotrcipuska7@gmail.com
 */
import * as fs from "fs";
import * as path from "path";
import admin from "firebase-admin";
import { createClerkClient } from "@clerk/nextjs/server";
import {
  machineKeyFromFingerprint,
  buildPanelDeviceId,
} from "../lib/firestore/devices";

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

const db = admin.firestore();
const email = process.argv[2] ?? "brzotrcipuska7@gmail.com";

function machineKeyFromDeviceDoc(
  deviceId: string,
  data?: FirebaseFirestore.DocumentData
): string {
  if (data?.machineKey) return String(data.machineKey);
  const suffix = deviceId.replace(/^panel(?:-ae)?-[^-]+-/, "");
  if (suffix && suffix !== deviceId) {
    return machineKeyFromFingerprint(suffix);
  }
  return "";
}

async function main() {
  const docs: FirebaseFirestore.DocumentSnapshot[] = [];
  for (const field of ["userEmail", "email"]) {
    const snap = await db
      .collection("users")
      .where(field, "==", email)
      .limit(5)
      .get();
    docs.push(...snap.docs);
  }

  if (!docs.length && process.env.CLERK_SECRET_KEY) {
    const clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const list = await clerk.users.getUserList({
      emailAddress: [email],
      limit: 5,
    });
    for (const u of list.data) {
      const d = await db.collection("users").doc(u.id).get();
      if (d.exists) docs.push(d);
      else console.log("Clerk id", u.id, "— no Firestore users doc");
    }
  }

  if (!docs.length) {
    console.log("NO USER FOUND for", email);
    return;
  }

  for (const doc of docs) {
    const d = doc.data()!;
    const id = doc.id;
    const devSnap = await db
      .collection("users")
      .doc(id)
      .collection("devices")
      .get();

    console.log("\n=== USER", id, "===");
    console.log({
      email: d.userEmail ?? d.email,
      plan: d.plan,
      deviceLimit: d.deviceLimit ?? 1,
      licenseStatus: d.licenseStatus,
    });

    const keys = new Set<string>();
    for (const dev of devSnap.docs) {
      const key = machineKeyFromDeviceDoc(dev.id, dev.data());
      if (key) keys.add(key);
      console.log("\n  DEVICE", dev.id);
      console.log("    data:", dev.data());
      console.log("    derived machineKey:", key || "(empty)");
    }
    console.log("\n  distinct machine keys:", [...keys]);
    console.log("  device doc count:", devSnap.size);

    // Simulate AE + PR fingerprints if we had them from panel_auth_codes
    const codes = await db
      .collection("panel_auth_codes")
      .where("userId", "==", id)
      .limit(10)
      .get()
      .catch(() => null);
    if (codes && !codes.empty) {
      console.log("\n  recent auth codes:");
      for (const c of codes.docs) {
        const cd = c.data();
        const fp = cd.machineFingerprint as string | undefined;
        if (fp) {
          console.log("   ", c.id, {
            hostApp: cd.hostApp,
            fp,
            newDeviceId: buildPanelDeviceId(id, fp),
            machineKey: machineKeyFromFingerprint(fp),
          });
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
