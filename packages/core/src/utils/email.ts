import * as z from "zod";

/**
 * @see https://www.rfc-editor.org/rfc/rfc6761.html#section-6.4
 */
const PLACEHOLDER_EMAIL_DOMAIN = "placeholder.invalid";

export interface PlaceholderEmailOptions {
	/**
	 * A stable identifier that distinguishes the account within the namespace.
	 */
	identifier: string;
	/**
	 * A namespace that distinguishes identical identifiers from different sources.
	 */
	namespace: string;
}

/**
 * Creates a stable, non-routable email address for an account without an email.
 *
 * @throws TypeError if the generated email is invalid.
 */
export function createPlaceholderEmail({
	identifier,
	namespace,
}: PlaceholderEmailOptions): string {
	const result = z
		.email()
		.safeParse(`${identifier}@${namespace}.${PLACEHOLDER_EMAIL_DOMAIN}`);
	if (!result.success) {
		throw new TypeError("Invalid placeholder email");
	}

	return result.data;
}
