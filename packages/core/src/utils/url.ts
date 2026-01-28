/**
 * Normalizes a request pathname by removing the basePath prefix and trailing slashes.
 * This is useful for matching paths against configured path lists.
 *
 * @param requestUrl - The full request URL
 * @param basePath - The base path of the auth API (e.g., "/api/auth")
 * @returns The normalized path without basePath prefix or trailing slashes,
 *          or "/" if URL parsing fails
 *
 * @example
 * normalizePathname("http://localhost:3000/api/auth/sso/saml2/callback/provider1", "/api/auth")
 * // Returns: "/sso/saml2/callback/provider1"
 *
 * normalizePathname("http://localhost:3000/sso/saml2/callback/provider1/", "/")
 * // Returns: "/sso/saml2/callback/provider1"
 */
export function normalizePathname(
	requestUrl: string,
	basePath: string,
): string {
	let pathname: string;
	try {
		pathname = new URL(requestUrl).pathname.replace(/\/+$/, "") || "/";
	} catch {
		return "/";
	}

	if (basePath === "/" || basePath === "") {
		return pathname;
	}

	// Check for exact match or proper path boundary (basePath followed by "/" or end)
	// This prevents "/api/auth" from matching "/api/authevil/..."
	if (pathname === basePath) {
		return "/";
	}

	if (pathname.startsWith(basePath + "/")) {
		return pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
	}

	return pathname;
}
