import { base64 } from "@better-auth/utils/base64";

const BASIC_PREFIX = "Basic ";

/**
 * Encodes a value using `application/x-www-form-urlencoded` per the URL
 * Living Standard. Differs from `encodeURIComponent` in two ways: it escapes
 * `!`, `'`, `(`, `)`, and `*`, and it represents space as `+` rather than
 * `%20`.
 */
function formUrlEncode(value: string): string {
	return new URLSearchParams({ v: value }).toString().slice("v=".length);
}

/**
 * Inverse of `formUrlEncode`: decodes a single `application/x-www-form-urlencoded`
 * value, handling both `+` and `%20` as space.
 */
function formUrlDecode(value: string): string {
	const decoded = new URLSearchParams(`v=${value}`).get("v");
	if (decoded === null) {
		throw new Error("form-url-encoded value could not be decoded");
	}
	return decoded;
}

/**
 * Encodes an OAuth client id and secret as an HTTP Basic credential string.
 *
 * Follows RFC 6749 §2.3.1: both values are `application/x-www-form-urlencoded`
 * prior to base64 encoding. The returned string is the full value of the
 * `Authorization` header, including the `Basic ` prefix.
 */
export function encodeBasicCredentials(
	clientId: string,
	clientSecret: string,
): string {
	const payload = `${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`;
	return `${BASIC_PREFIX}${base64.encode(payload)}`;
}

/**
 * Decodes an `Authorization: Basic …` header value into its OAuth client id
 * and secret.
 *
 * The base64 payload is split on the first `:` only, so secrets containing
 * colons round-trip correctly. Each half is form-url-decoded per RFC 6749
 * §2.3.1, accepting both `+` and `%20` as space. Per the URL Living Standard,
 * invalid percent-escapes pass through as-is; downstream client lookup will
 * fail with `invalid_client` for malformed credentials.
 *
 * Throws when the header is not a Basic credential, when the base64 payload
 * contains no `:`, or when either half is empty.
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
	return {
		clientId: formUrlDecode(rawClientId),
		clientSecret: formUrlDecode(rawClientSecret),
	};
}
