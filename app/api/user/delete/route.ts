import { requireUser, destroySession, clearSessionCookie } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


export async function DELETE() {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId, sessionId } = authResult.user;

  try {
    // 1. Delete all Firestore data for this user
    await deleteFirestoreData(userId);

    await destroySession(sessionId);

    const res = NextResponse.json({ success: true });
    clearSessionCookie(res);
    return res;
  } catch (err: unknown) {
    console.error("[DELETE /api/user/delete]", err);
    const message = err instanceof Error ? err.message : "Deletion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function deleteFirestoreData(userId: string) {
  const batch = db.batch();

  // users/{userId}/jobs (subcollection)
  const jobs = await db.collection("users").doc(userId).collection("jobs").listDocuments();
  for (const ref of jobs) batch.delete(ref);

  // users/{userId} doc
  batch.delete(db.collection("users").doc(userId));

  // devices where userId matches
  const devices = await db.collection("devices").where("userId", "==", userId).get();
  for (const doc of devices.docs) batch.delete(doc.ref);

  // support tickets
  const tickets = await db.collection("supportTickets").where("userId", "==", userId).get();
  for (const ticket of tickets.docs) {
    // ticket messages subcollection
    const msgs = await ticket.ref.collection("messages").listDocuments();
    for (const m of msgs) batch.delete(m);
    batch.delete(ticket.ref);
  }

  // ticket screenshots
  const screenshots = await db.collection("ticketScreenshots").where("userId", "==", userId).get();
  for (const doc of screenshots.docs) batch.delete(doc.ref);

  await batch.commit();
}
