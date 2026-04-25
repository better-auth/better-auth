const HANDLING_DOCS_URL =
	"https://www.better-auth.com/docs/concepts/oauth#handling-providers-without-email";

/**
 * Build the logger message shown when an OAuth provider does not return an
 * email address. Kept in one place so every rejection site points users at
 * the same workaround docs.
 */
export function missingEmailLogMessage(
	providerId: string,
	options?: { source?: "id_token" | "generic" },
): string {
	const subject =
		options?.source === "generic"
			? `Generic OAuth provider "${providerId}"`
			: `Provider "${providerId}"`;
	const where = options?.source === "id_token" ? " in the id token" : "";
	return `${subject} did not return an email${where}. Either request the provider's email scope, or synthesize one via \`mapProfileToUser\`. See ${HANDLING_DOCS_URL}`;
}
