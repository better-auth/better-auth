/**
 * Encodes clientId and clientSecret for HTTP Basic Auth (RFC 7617)
 * @param clientId - OAuth2 client ID
 * @param clientSecret - OAuth2 client secret
 * @returns The value for the Authorization header: "Basic <base64>"
 */
export function encodeBasicAuthHeader(
	clientId: string,
	clientSecret: string,
): string {
	const credentials = `${clientId}:${clientSecret}`;
	const encoded = Buffer.from(credentials).toString("base64");
	return `Basic ${encoded}`;
}
