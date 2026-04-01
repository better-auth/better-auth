import { NextResponse } from "next/server";
import { Resend } from "resend";

function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

function str(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const raw = body ?? {};

		const name = str(raw.fullName) ?? str(raw.name) ?? "";
		const email = str(raw.email) ?? "";
		const company = str(raw.company);
		const website = str(raw.website);
		const userCount = str(raw.userCount) ?? str(raw.companySize);
		const interest = str(raw.interest) ?? "enterprise";
		const features = str(raw.features);
		const additional = str(raw.additional) ?? str(raw.description);
		const migrating = str(raw.migrating);
		const currentPlatform = str(raw.currentPlatform);

		if (!name || !email) {
			return NextResponse.json(
				{ success: false, message: "Missing required fields" },
				{ status: 400 },
			);
		}

		const toEmail = process.env.SUPPORT_EMAIL;
		if (!toEmail) {
			return NextResponse.json(
				{ success: false, message: "Missing required fields" },
				{ status: 400 },
			);
		}

		const resendApiKey = process.env.RESEND_API_KEY;
		if (resendApiKey) {
			try {
				const resend = new Resend(resendApiKey);
				await resend.emails.send({
					from: "Enterprise Support <enterprise@better-auth.com>",
					to: toEmail,
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

		return NextResponse.json({ success: true });
	} catch (e) {
		console.error(e);
		return NextResponse.json(
			{ success: false, message: "Invalid request" },
			{ status: 400 },
		);
	}
}
