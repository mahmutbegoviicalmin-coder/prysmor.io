import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

const ADMIN_EMAIL = "mahmutbegoviic.almin@gmail.com";

async function checkAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses.some((e) => e.emailAddress === ADMIN_EMAIL);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
