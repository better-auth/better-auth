import { NextResponse } from "next/server";
import { Resend } from "resend";
import { contactSchema, isFreeEmail } from "@/lib/enterprise-contact";

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

export async function POST(request: Request) {
	try {
		const body = await request.json();

		// honeypot - bots fill hidden fields
		if (typeof body?._hp === "string" && body._hp) {
			return NextResponse.json({});
		}

		const parsed = contactSchema.safeParse(body);

		if (!parsed.success) {
			const firstError = parsed.error.issues[0];
			const field = firstError?.path[0];
			if (field === "email") {
				return NextResponse.json(
					{ message: "Please enter a valid email address" },
					{ status: 422 },
				);
			}
			return NextResponse.json(
				{ message: "Missing required fields" },
				{ status: 400 },
			);
		}

		const { fullName, email, company, companySize, description } = parsed.data;

		if (isFreeEmail(email)) {
			return NextResponse.json(
				{ message: "Please use a company email address" },
				{ status: 422 },
			);
		}

		const toEmail = process.env.SUPPORT_EMAIL;
		const resendApiKey = process.env.RESEND_API_KEY;
		if (!toEmail || !resendApiKey) {
			console.error("Missing SUPPORT_EMAIL or RESEND_API_KEY");
			return NextResponse.json(
				{ message: "Server configuration error" },
				{ status: 500 },
			);
		}

		const resend = new Resend(resendApiKey);
		const { error } = await resend.emails.send({
			from: "Enterprise Support <enterprise@better-auth.com>",
			to: toEmail,
			subject: `Enterprise Inquiry from ${fullName}`,
			html: `
					<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
						<h2 style="color: #18181b;">Enterprise Inquiry</h2>
						<div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
							<p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
							<p><strong>Email:</strong> ${escapeHtml(email)}</p>
							<p><strong>Company:</strong> ${escapeHtml(company)}</p>
							${companySize ? `<p><strong>Company Size:</strong> ${escapeHtml(companySize)}</p>` : ""}
							${description ? `<p><strong>Message:</strong><br/>${escapeHtml(description).replace(/\n/g, "<br/>")}</p>` : ""}
						</div>
						<p style="color: #71717a; font-size: 12px;">
							Submitted: ${new Date().toLocaleString()}<br/>
							User Agent: ${escapeHtml(request.headers.get("user-agent") || "N/A")}<br/>
							Referer: ${escapeHtml(request.headers.get("referer") || "N/A")}
						</p>
					</div>
				`,
		});
		if (error) {
			console.error("Resend email failed", error);
			return NextResponse.json(
				{ message: "Something went wrong. Please try again." },
				{ status: 500 },
			);
		}

		return NextResponse.json({});
	} catch (e) {
		console.error("Enterprise contact form error", e);
		return NextResponse.json(
			{ message: "Something went wrong. Please try again." },
			{ status: 500 },
		);
	}
}
