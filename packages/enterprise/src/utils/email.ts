interface SendEmailOptions {
	to: string;
	subject: string;
	text?: string;
	html?: string;
	from?: string;
}

/**
 * Sends an email using the configured email service.
 * Currently supports Resend. Falls back to console logging in development.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
	const { to, subject, text, html, from } = options;

	// Use Resend if API key is configured
	const resendApiKey = process.env.RESEND_API_KEY;

	if (resendApiKey) {
		try {
			// Dynamic import to avoid requiring resend package if not used
			const { Resend } = await import("resend");
			const client = new Resend(resendApiKey);

			await client.emails.send({
				from: from || process.env.EMAIL_FROM || "onboarding@resend.dev",
				to,
				subject,
				text: text,
				html: html,
				react: undefined,
			});

			return;
		} catch (error) {
			// If resend package is not installed, log warning and fall through to console
			if ((error as Error).message?.includes("Cannot find module")) {
				console.warn(
					"Resend package not found. Install it with: npm install resend",
				);
			} else {
				throw error;
			}
		}
	}

	// Fallback to console logging in development
	if (process.env.NODE_ENV !== "production") {
		console.log("=".repeat(50));
		console.log("📧 Email would be sent:");
		console.log(`To: ${to}`);
		console.log(`Subject: ${subject}`);
		console.log(
			`From: ${from || process.env.EMAIL_FROM || "noreply@example.com"}`,
		);
		if (text) console.log(`Text:\n${text}`);
		if (html) console.log(`HTML:\n${html}`);
		console.log("=".repeat(50));
		return;
	}

	// In production without email service, throw error
	throw new Error(
		"Email service not configured. Set RESEND_API_KEY environment variable or configure another email service.",
	);
}
