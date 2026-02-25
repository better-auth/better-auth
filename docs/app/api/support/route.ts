import { NextResponse } from "next/server";
import { Resend } from "resend";

// Helper function to escape HTML entities
function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const {
			name,
			email,
			company,
			website,
			userCount,
			interest,
			features,
			additional,
			migrating,
			currentPlatform,
		} = body ?? {};

		if (!name || !email) {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 },
			);
		}
		const toEmail = process.env.SUPPORT_EMAIL;
		if (!toEmail) {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 },
			);
		}
		const resendApiKey = process.env.RESEND_API_KEY;
		if (resendApiKey) {
			try {
				const resend = new Resend(resendApiKey);
				await resend.emails.send({
					from: "Enterprise Support <enterprise@better-auth.com>",
					to: toEmail || "",
					subject: `${interest === "enterprise" ? "Enterprise" : "Support"} Inquiry from ${name}`,
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
							<h2 style="color: #18181b;">${interest === "enterprise" ? "Enterprise" : "Support"} Inquiry</h2>
							<div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
								<p><strong>Name:</strong> ${escapeHtml(name)}</p>
								<p><strong>Email:</strong> ${escapeHtml(email)}</p>
								${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ""}
								${website ? `<p><strong>Website:</strong> ${escapeHtml(website)}</p>` : ""}
								${userCount ? `<p><strong>User Count:</strong> ${escapeHtml(userCount)}</p>` : ""}
								${migrating ? `<p><strong>Migrating:</strong> ${migrating === "yes" ? "Yes" : "No"}</p>` : ""}
								${currentPlatform ? `<p><strong>Current Platform:</strong> ${escapeHtml(currentPlatform)}</p>` : ""}
								${interest ? `<p><strong>Interest:</strong> ${escapeHtml(interest)}</p>` : ""}
								${features ? `<p><strong>Features:</strong> ${escapeHtml(features)}</p>` : ""}
								${additional ? `<p><strong>Message:</strong><br/>${escapeHtml(additional).replace(/\n/g, "<br/>")}</p>` : ""}
							</div>
							<p style="color: #71717a; font-size: 12px;">
								Submitted: ${new Date().toLocaleString()}<br/>
								User Agent: ${escapeHtml(request.headers.get("user-agent") || "N/A")}<br/>
								Referer: ${escapeHtml(request.headers.get("referer") || "N/A")}
							</p>
						</div>
					`,
				});
			} catch (e) {
				console.error("Resend email failed", e);
			}
		}

		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
}
