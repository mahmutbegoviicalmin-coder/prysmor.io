import { requireAdmin } from "@/lib/admin/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { body, status } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const ticketRef = db.collection("support_tickets").doc(params.id);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ticket = ticketSnap.data()!;

  const message = {
    body: body.trim(),
    authorType: "admin",
    authorName: "Prysmor Support",
    createdAt: new Date().toISOString(),
  };

  await ticketRef.collection("messages").add(message);
  await ticketRef.update({
    status: status ?? "in_progress",
    updatedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  });

  // Email user
  if (resend && ticket.email) {
    const shortId = params.id.slice(0, 6).toUpperCase();
    await resend.emails.send({
      from: "Prysmor Support <support@prysmor.io>",
      to: ticket.email,
      replyTo: "support@prysmor.io",
      subject: `Re: [#${shortId}] ${ticket.issueType}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111;">
          <div style="background:#0d0d0d;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="color:#39FF6A;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px;">
              Prysmor Support
            </p>
            <h2 style="color:white;font-size:18px;font-weight:600;margin:0;">
              We replied to your ticket
            </h2>
            <p style="color:#555;font-size:12px;margin:6px 0 0;">Ticket #${shortId} · ${ticket.issueType}</p>
          </div>

          <div style="background:#f9f9f9;border:1px solid #eee;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
            <div style="background:white;border-left:3px solid #39FF6A;padding:14px 18px;border-radius:0 8px 8px 0;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap;margin-bottom:24px;">
${body.trim()}
            </div>

            <a href="https://prysmor.io/dashboard/support/${params.id}"
              style="display:inline-block;background:#111;color:white;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:20px;">
              View full conversation →
            </a>

            <p style="font-size:11px;color:#9CA3AF;margin:0;">
              You can reply directly in your Prysmor dashboard under Support → My Tickets.
            </p>
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { status } = await req.json();
  await db.collection("support_tickets").doc(params.id).update({
    status,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
