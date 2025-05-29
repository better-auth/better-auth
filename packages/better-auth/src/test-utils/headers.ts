/**
 * converts set cookie containing headers to
 * cookie containing headers
 */
export function convertSetCookieToCookie(headers: Headers): Headers {
	const setCookieHeaders: string[] = [];
	headers.forEach((value, name) => {
		if (name.toLowerCase() === "set-cookie") {
			setCookieHeaders.push(value);
		}
	});

	if (setCookieHeaders.length === 0) {
		return headers;
	}

	const existingCookies = headers.get("cookie") || "";
	const cookies = existingCookies ? existingCookies.split("; ") : [];

	setCookieHeaders.forEach((setCookie) => {
		const [cookiePair] = setCookie.split(";");
		cookies.push(cookiePair.trim());
	});

	headers.set("cookie", cookies.join("; "));

	return headers;
}

/**
 * Creates headers with tenant ID for multi-tenancy testing
 */
export function createHeadersWithTenantId(
	tenantId: string,
	additionalHeaders?: Record<string, string> | Headers
): Headers {
	const headers = new Headers();
	headers.set("x-internal-tenantid", tenantId);

	if (additionalHeaders) {
		if (additionalHeaders instanceof Headers) {
			additionalHeaders.forEach((value, name) => {
				headers.set(name, value);
			});
		} else {
			Object.entries(additionalHeaders).forEach(([key, value]) => {
				headers.set(key, value);
			});
		}
	}

	return headers;
}

/**
 * Adds tenant ID to existing headers
 */
export function addTenantIdToHeaders(
	headers: Headers,
	tenantId: string
): Headers {
	const newHeaders = new Headers(headers);
	newHeaders.set("x-internal-tenantid", tenantId);
	return newHeaders;
}
