import { db } from "@/lib/firebaseAdmin";

export async function logActivity(userId: string, prompt: string) {
  await db.collection("activity").add({
    userId,
    prompt,
    createdAt: new Date(),
  });
}
