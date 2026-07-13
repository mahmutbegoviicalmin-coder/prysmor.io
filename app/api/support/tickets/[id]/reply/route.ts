import { requireUser } from '@/lib/auth/session';
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId, email } = authResult.user;

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const ticketRef = db.collection("support_tickets").doc(params.id);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ticketSnap.data()!.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const authorName = email.split("@")[0] || "User";

  const message = {
    body: body.trim(),
    authorType: "user",
    authorName,
    createdAt: new Date().toISOString(),
  };

  await ticketRef.collection("messages").add(message);
  await ticketRef.update({
    status: "open",
    updatedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  });

  // Notify admin
  if (resend) {
    const ticket = ticketSnap.data()!;
    await resend.emails.send({
      from: "Prysmor Support <support@prysmor.io>",
      to: "mahmutbegoviic.almin@gmail.com",
      replyTo: ticket.email,
      subject: `[Reply on #${params.id.slice(0, 6).toUpperCase()}] ${ticket.issueType}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;">
          <p style="color:#555;font-size:13px;margin:0 0 16px;">
            <strong style="color:#111;">${authorName}</strong> replied on ticket
            <code>#${params.id.slice(0, 6).toUpperCase()}</code>
          </p>
          <div style="background:#f9f9f9;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.7;">${body.trim()}</div>
          <p style="margin-top:20px;">
            <a href="https://prysmor.io/dashboard/admin?tab=support&ticket=${params.id}"
              style="background:#111;color:white;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;display:inline-block;">
              View &amp; Reply in Admin
            </a>
          </p>
        </div>
      `,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
