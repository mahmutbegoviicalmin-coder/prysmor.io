import { requireAdmin } from "@/lib/admin/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const snap = await db
    .collection("support_tickets")
    .orderBy("createdAt", "desc")
    .get();

  const tickets = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ tickets });
}
