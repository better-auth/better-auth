const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const isTTY = process.stdout && process.stdout.isTTY;
const isDisabled =
	String(process.env.BETTER_AUTH_SILENT_POSTINSTALL || "").toLowerCase() ===
		"1" ||
	String(process.env.BETTER_AUTH_SILENT_POSTINSTALL || "").toLowerCase() ===
		"true";

if (isCI || !isTTY || isDisabled) {
	process.exit(0);
}

const message = `\n\n\x1b[36mBetter Auth\x1b[0m — Anonymous telemetry notice
\nWe collect minimal, anonymous usage telemetry to help improve Better Auth.

You can disable it at any time:
  • In config: \x1b[33mtelemetry: { enabled: false }\x1b[0m
  • Or via env: \x1b[33mBETTER_AUTH_TELEMETRY=0\x1b[0m

You can also debug what would be sent by setting:
  • \x1b[33mBETTER_AUTH_TELEMETRY_DEBUG=1\x1b[0m

Learn more in the docs: https://www.better-auth.com/docs/reference/telemetry\n\n`;

try {
	// eslint-disable-next-line no-console
	console.log(message);
} catch {
	// ignore
}
