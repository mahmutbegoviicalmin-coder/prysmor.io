import { db } from "@/lib/firebaseAdmin";

export interface UserDoc {
  plan: string;
  licenseStatus: "active" | "inactive" | "trialing";
  deviceLimit: number;
  monthlyAllowance?: number;
  renewalDate?: string;
  createdAt: FirebaseFirestore.Timestamp | Date;
}

export const PLAN_LABELS: Record<string, string> = {
  starter:  "Starter",
  pro:      "Pro",
  exclusive: "Exclusive",
  creator:  "Creator Suite",
  "creator-suite": "Creator Suite",
};

export const PLAN_ALLOWANCE: Record<string, number> = {
  starter:  25,
  pro:      50,
  exclusive: 100,
  creator:  50,
  "creator-suite": 100,
};

export async function createUser(userId: string) {
  const ref = db.collection("users").doc(userId);
  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({
      plan: "starter",
      licenseStatus: "active",
      deviceLimit: 2,
      createdAt: new Date(),
    });
  }
}

export async function getUser(userId: string): Promise<UserDoc | null> {
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return null;
  return doc.data() as UserDoc;
}
