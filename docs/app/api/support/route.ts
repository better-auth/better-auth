import { NextResponse } from "next/server";

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
		} = body ?? {};

		if (!name || !email) {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 },
			);
		}

		const payload = {
			name,
			email,
			company: company ?? "",
			website: website ?? "",
			userCount: userCount ?? "",
			interest: interest ?? "",
			features: features ?? "",
			additional: additional ?? "",
			submittedAt: new Date().toISOString(),
			userAgent: request.headers.get("user-agent") ?? undefined,
			referer: request.headers.get("referer") ?? undefined,
		};

		const webhook = process.env.SUPPORT_WEBHOOK_URL;
		if (webhook) {
			try {
				await fetch(webhook, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			} catch (e) {
				console.error("Support webhook failed", e);
			}
		} else {
			console.log("[support] submission", payload);
		}

		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
}
