type DemoEmailTemplate =
	| "invitation"
	| "reset-password"
	| "two-factor"
	| "verify-email";

type DemoEmailRequest = {
	to: string;
	subject: string;
	template: DemoEmailTemplate;
	variables: Record<string, string | undefined>;
};

function renderDemoEmailText(email: DemoEmailRequest) {
	const variableLines = Object.entries(email.variables)
		.filter((entry) => entry[1] !== undefined && entry[1] !== "")
		.map(([key, value]) => `${key}: ${value}`);

	return [
		`Template: ${email.template}`,
		`To: ${email.to}`,
		`Subject: ${email.subject}`,
		"",
		...variableLines,
	].join("\n");
}

export async function sendDemoEmail(email: DemoEmailRequest) {
	const rendered = renderDemoEmailText(email);

	if (
		process.env.NODE_ENV === "development" ||
		!process.env.RESEND_API_KEY ||
		process.env.RESEND_API_KEY === "re_123"
	) {
		console.info(`\n[demo-email]\n${rendered}\n`);
		return;
	}

	const { resend } = await import("./email/resend");
	await resend.emails.send({
		from:
			process.env.DEMO_FROM_EMAIL || "Better Auth Demo <demo@better-auth.com>",
		to: email.to,
		subject: email.subject,
		text: rendered,
	});
}
