import { base64 } from "@better-auth/utils/base64";

const BASIC_PREFIX = "Basic ";

/**
 * Encodes an OAuth client id and secret as an HTTP Basic credential string.
 *
 * Follows RFC 6749 §2.3.1: both values are percent-encoded
 * (`application/x-www-form-urlencoded`) prior to base64 encoding. The returned
 * string is the value of the `Authorization` header, including the `Basic `
 * prefix.
 */
export function encodeBasicCredentials(
	clientId: string,
	clientSecret: string,
): string {
	const payload = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
	return `${BASIC_PREFIX}${base64.encode(payload)}`;
}

/**
 * Decodes an `Authorization: Basic …` header value into its OAuth client id
 * and secret.
 *
 * The base64 payload is split on the first `:` only, so secrets containing
 * colons round-trip correctly. Both values are percent-decoded per RFC 6749
 * §2.3.1.
 *
 * Throws when the header is not a Basic credential, when the base64 payload
 * contains no `:`, when either half is empty, or when either half is not
 * valid percent-encoded text.
 */
export function decodeBasicCredentials(authorization: string): {
	clientId: string;
	clientSecret: string;
} {
	if (!authorization.startsWith(BASIC_PREFIX)) {
		throw new Error("Authorization header is not a Basic credential");
	}
	const encoded = authorization.slice(BASIC_PREFIX.length);
	const decoded = new TextDecoder().decode(base64.decode(encoded));
	const separatorIndex = decoded.indexOf(":");
	if (separatorIndex === -1) {
		throw new Error(
			"Basic credential is missing the client id/secret separator",
		);
	}
	const rawClientId = decoded.slice(0, separatorIndex);
	const rawClientSecret = decoded.slice(separatorIndex + 1);
	if (!rawClientId || !rawClientSecret) {
		throw new Error(
			"Basic credential client id and secret must both be non-empty",
		);
	}
	let clientId: string;
	let clientSecret: string;
	try {
		clientId = decodeURIComponent(rawClientId);
		clientSecret = decodeURIComponent(rawClientSecret);
	} catch {
		throw new Error(
			"Basic credential contains invalid percent-encoded characters",
		);
	}
	return { clientId, clientSecret };
}
