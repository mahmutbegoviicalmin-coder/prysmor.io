import { requireUser } from '@/lib/auth/session';
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.user;

  const ticketRef = db.collection("support_tickets").doc(params.id);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ticket = ticketSnap.data()!;
  // Users can only view their own tickets
  if (ticket.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messagesSnap = await ticketRef
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  const messages = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ ticket: { id: ticketSnap.id, ...ticket }, messages });
}
