import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { issueType, adobeVersion, osVersion, pluginVersion, description, email, screenshotUrl } = body;

  if (!issueType || !description || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const ticketData = {
    userId,
    email,
    issueType,
    adobeVersion: adobeVersion || "Not specified",
    osVersion: osVersion || "Not specified",
    pluginVersion: pluginVersion || "Not specified",
    description,
    screenshotUrl: screenshotUrl || null,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  const docRef = await db.collection("support_tickets").add(ticketData);

  // Send email notification via Resend
  if (resend) {
    await resend.emails.send({
      from: "Prysmor Support <support@prysmor.io>",
      to: "mahmutbegoviic.almin@gmail.com",
      replyTo: email,
      subject: `[Support #${docRef.id.slice(0, 6).toUpperCase()}] ${issueType}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111;">
          <div style="background:#0d0d0d;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="color:#39FF6A;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">
              New Support Ticket
            </p>
            <h1 style="color:white;font-size:20px;font-weight:700;margin:0;">
              ${issueType}
            </h1>
            <p style="color:#555;font-size:12px;margin:6px 0 0;">
              Ticket ID: <code style="color:#888;">${docRef.id}</code>
            </p>
          </div>

          <div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none;">

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
              <tr>
                <td style="padding:8px 0;color:#666;width:160px;border-bottom:1px solid #eee;">From</td>
                <td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:500;">
                  <a href="mailto:${email}" style="color:#111;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;border-bottom:1px solid #eee;">Adobe Version</td>
                <td style="padding:8px 0;border-bottom:1px solid #eee;">${ticketData.adobeVersion}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;border-bottom:1px solid #eee;">Operating System</td>
                <td style="padding:8px 0;border-bottom:1px solid #eee;">${ticketData.osVersion}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Plugin Version</td>
                <td style="padding:8px 0;">${ticketData.pluginVersion}</td>
              </tr>
            </table>

            <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin:0 0 8px;">
              Description
            </p>
            <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:13px;line-height:1.7;color:#374151;white-space:pre-wrap;">
${description}
            </div>

            ${screenshotUrl ? `
            <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin:20px 0 8px;">
              Screenshot
            </p>
            <a href="${screenshotUrl}" target="_blank">
              <img src="${screenshotUrl}" alt="Screenshot" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;" />
            </a>
            ` : ""}

            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
              <a href="mailto:${email}?subject=Re: [Support #${docRef.id.slice(0, 6).toUpperCase()}] ${issueType}"
                style="display:inline-block;background:#111;color:white;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">
                Reply to user
              </a>
            </div>
          </div>
        </div>
      `,
    }).catch(() => {}); // don't fail ticket submission if email fails
  }

  return NextResponse.json({ ok: true, ticketId: docRef.id });
}
