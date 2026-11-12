import { BetterAuthError } from "@better-auth/core/error";

/**
 * DBSC wire format, checked against w3c/webappsec-dbsc@3f0424f and Chrome 157.
 * The draft still renames things, so a rename should only touch this file.
 *
 * @see https://w3c.github.io/webappsec-dbsc/
 */

export const REGISTRATION_HEADER = "secure-session-registration";
export const CHALLENGE_HEADER = "secure-session-challenge";
export const RESPONSE_HEADER = "secure-session-response";
export const SESSION_ID_HEADER = "sec-secure-session-id";
export const SKIPPED_HEADER = "secure-session-skipped";

export const PROOF_TYPE = "dbsc+jwt";
export const ALGORITHMS = ["ES256", "RS256"] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

// A string may only hold printable ASCII, space through tilde.
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
// Inside the quotes, only a backslash and a double quote are escaped.
const BACKSLASH_OR_QUOTE = /[\\"]/g;

/**
 * Serializes a Structured Field string: `a"b` becomes `"a\"b"`.
 *
 * Chrome ignores a header it cannot parse, which would look like a refresh
 * that never gets its challenge, so a value that cannot be a string fails
 * loudly instead.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9651.html#section-4.1.6
 */
function sfString(value: string) {
	if (!PRINTABLE_ASCII.test(value)) {
		throw new BetterAuthError(
			"dbsc: a header value must be printable ASCII to be sent as a Structured Field string.",
		);
	}
	const escaped = value.replace(
		BACKSLASH_OR_QUOTE,
		(character) => `\\${character}`,
	);
	return `"${escaped}"`;
}

export function registrationHeader(
	algorithms: readonly Algorithm[],
	path: string,
	challenge: string,
) {
	return `(${algorithms.join(" ")});path=${sfString(path)};challenge=${sfString(challenge)}`;
}

export function challengeHeader(challenge: string, sessionId: string) {
	return `${sfString(challenge)};id=${sfString(sessionId)}`;
}

/**
 * Reads the item of a request header and ignores its parameters. The draft
 * says the item is a string, but Chrome sends `Secure-Session-Response` and
 * `Sec-Secure-Session-Id` without quotes, so both forms are accepted.
 */
export function readItem(value: string | null | undefined) {
	if (typeof value !== "string" || !value) return null;
	const item = value.trim();
	if (item.startsWith('"')) return readString(item);
	// Unquoted: the value runs up to the first parameter.
	return item.split(";")[0]?.trim() || null;
}

/**
 * Parses a Structured Field string, which starts at the opening quote and
 * may be followed by parameters. A backslash may only escape a backslash or
 * a quote.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9651.html#section-4.2.5
 */
function readString(item: string) {
	let value = "";
	for (let index = 1; index < item.length; index++) {
		const character = item.charAt(index);
		if (character === '"') return value || null;
		if (!PRINTABLE_ASCII.test(character)) return null;
		if (character !== "\\") {
			value += character;
			continue;
		}
		index++;
		const escaped = item.charAt(index);
		if (escaped !== '"' && escaped !== "\\") return null;
		value += escaped;
	}
	// The closing quote never came.
	return null;
}

// Chrome reports one entry per skipped session. The header is unauthenticated,
// so the rest is dropped rather than turned into events.
const MAX_SKIPPED = 4;

/**
 * Reads `Secure-Session-Skipped`, which Chrome attaches to a request it sent
 * without refreshing, e.g. `server_error;session_identifier="abc"`.
 */
export function readSkipped(value: string | null | undefined) {
	if (typeof value !== "string" || !value) return [];
	return value.split(",", MAX_SKIPPED).flatMap((member) => {
		const [reason, ...params] = member.split(";").map((part) => part.trim());
		if (!reason) return [];
		const identifier = params.find((param) =>
			param.startsWith("session_identifier="),
		);
		return [
			{
				reason,
				sessionId: readItem(identifier?.slice("session_identifier=".length)),
			},
		];
	});
}
