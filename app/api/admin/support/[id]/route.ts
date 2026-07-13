import { requireAdmin } from "@/lib/admin/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const ticketRef = db.collection("support_tickets").doc(params.id);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messagesSnap = await ticketRef
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  const messages = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({
    ticket: { id: ticketSnap.id, ...ticketSnap.data() },
    messages,
  });
}
