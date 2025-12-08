import { NextResponse } from "next/server";
import { Resend } from "resend";

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
		const resendApiKey = process.env.RESEND_API_KEY;
		if (resendApiKey) {
			try {
				const resend = new Resend(resendApiKey);
				const res = await resend.emails.send({
					from: "Enterprise Support <enterprise@better-auth.com>",
					to: toEmail || "",
					subject: `${interest === "enterprise" ? "Enterprise" : "Support"} Inquiry from ${name}`,
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
							<h2 style="color: #18181b;">${interest === "enterprise" ? "Enterprise" : "Support"} Inquiry</h2>
							<div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
								<p><strong>Name:</strong> ${name}</p>
								<p><strong>Email:</strong> ${email}</p>
								${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
								${website ? `<p><strong>Website:</strong> ${website}</p>` : ""}
								${userCount ? `<p><strong>User Count:</strong> ${userCount}</p>` : ""}
								${migrating ? `<p><strong>Migrating:</strong> ${migrating === "yes" ? "Yes" : "No"}</p>` : ""}
								${currentPlatform ? `<p><strong>Current Platform:</strong> ${currentPlatform}</p>` : ""}
								${interest ? `<p><strong>Interest:</strong> ${interest}</p>` : ""}
								${features ? `<p><strong>Features:</strong> ${features}</p>` : ""}
								${additional ? `<p><strong>Message:</strong><br/>${additional}</p>` : ""}
							</div>
							<p style="color: #71717a; font-size: 12px;">
								Submitted: ${new Date().toLocaleString()}<br/>
								User Agent: ${request.headers.get("user-agent") || "N/A"}<br/>
								Referer: ${request.headers.get("referer") || "N/A"}
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
