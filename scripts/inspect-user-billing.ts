/**
 * Inspect Firestore billing fields + LemonSqueezy subscription by email.
 * Run: npx tsx scripts/inspect-user-billing.ts fatirustemi@gmail.com
 */
import * as fs from "fs";
import * as path from "path";
import admin from "firebase-admin";
import { createClerkClient } from "@clerk/nextjs/server";

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
      clientEmail: "firebase-adminsdk-fbsvc@prysmor-4841d.iam.gserviceaccount.com",
      privateKey: pk,
    }),
  });
}

const email = process.argv[2] ?? "fatirustemi@gmail.com";
const searchQuery = process.argv[3] ?? "";

async function main() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  let userId: string | null = null;
  let clerkUser: Awaited<ReturnType<typeof clerk.users.getUserList>>["data"][0] | undefined;

  try {
    let user = (await clerk.users.getUserList({ emailAddress: [email], limit: 5 })).data[0];
    if (!user && searchQuery) {
      const all = await clerk.users.getUserList({ query: searchQuery, limit: 20 });
      user = all.data.find((u) =>
        u.emailAddresses.some((e) => e.emailAddress.toLowerCase().includes(searchQuery.toLowerCase())) ||
        [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (user) {
      clerkUser = user;
      userId = user.id;
    }
  } catch (e) {
    console.warn("Clerk lookup failed:", e);
  }

  if (!userId) {
    const snap = await admin.firestore().collection("users").limit(500).get();
    for (const d of snap.docs) {
      const x = d.data();
      const blob = JSON.stringify(x).toLowerCase();
      if (blob.includes(email.toLowerCase()) || (searchQuery && blob.includes(searchQuery.toLowerCase()))) {
        userId = d.id;
        console.log("Found via Firestore scan:", d.id);
        break;
      }
    }
  }

  if (!userId) {
    console.log("User not found for", email, searchQuery || "");
    process.exit(1);
  }

  if (clerkUser) {
    console.log("=== Clerk ===");
    console.log("userId:", clerkUser.id);
    console.log("email:", clerkUser.emailAddresses[0]?.emailAddress);
    console.log("name:", clerkUser.firstName, clerkUser.lastName);
    console.log("created:", new Date(clerkUser.createdAt).toISOString());
  } else {
    console.log("=== Clerk ===");
    console.log("userId:", userId, "(from Firestore only)");
  }

  const doc = await admin.firestore().collection("users").doc(userId).get();
  const data = doc.data() ?? {};
  console.log("\n=== Firestore users/{id} ===");
  console.log(JSON.stringify(data, null, 2));

  const subId = data.lsSubscriptionId as string | undefined;
  const lsKey = process.env.LEMONSQUEEZY_API_KEY;
  if (subId && lsKey) {
    const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subId}`, {
      headers: {
        Authorization: `Bearer ${lsKey}`,
        Accept: "application/vnd.api+json",
      },
    });
    if (!res.ok) {
      console.log("\n=== LemonSqueezy ===");
      console.log("API error", res.status, await res.text());
    } else {
      const json = await res.json();
      const a = json.data.attributes;
      console.log("\n=== LemonSqueezy subscription ===");
      console.log({
        id: json.data.id,
        status: a.status,
        variant_id: a.variant_id,
        renews_at: a.renews_at,
        ends_at: a.ends_at,
        cancelled: a.cancelled,
        pause: a.pause,
        billing_anchor: a.billing_anchor,
        created_at: a.created_at,
        updated_at: a.updated_at,
      });
    }
  } else {
    console.log("\nNo lsSubscriptionId or LEMONSQUEEZY_API_KEY — skipping LS API");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
