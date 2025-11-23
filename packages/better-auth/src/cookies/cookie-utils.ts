interface CookieAttributes {
	value: string;
	"max-age"?: number | undefined;
	expires?: Date | undefined;
	domain?: string | undefined;
	path?: string | undefined;
	secure?: boolean | undefined;
	httponly?: boolean | undefined;
	samesite?: ("strict" | "lax" | "none") | undefined;
	[key: string]: any;
}

/**
 * Robust parser for multiple Set-Cookie headers
 * Supports comma inside Expires attribute
 * RFC 6265-compliant
 */
export function parseSetCookieHeader(
	setCookie: string,
): Map<string, CookieAttributes> {
	const cookies = new Map<string, CookieAttributes>();

	// Split different cookies using regex that does NOT split inside date strings
	const cookieParts = setCookie.match(
		/(?:[^,]*?Expires=[^,]+(?:, [A-Za-z]{3} [0-9]{2} [0-9]{4})?[^,;]*|[^,]+?)(?:(?=, [^;]+=)|$)/g,
	);

	if (!cookieParts) return cookies;

	cookieParts.forEach((cookieString) => {
		const segments = cookieString.split(";").map((part) => part.trim());
		const [nameValue, ...attributes] = segments;

		if (!nameValue) return;

		const [name, ...valueParts] = nameValue.split("=");
		if (!name) return;

		const value = valueParts.join("=");

		const attrObj: CookieAttributes = { value };

		attributes.forEach((attr) => {
			const [rawName, ...rawValueParts] = attr.split("=");
			if (!rawName) return;
			const name = rawName.trim().toLowerCase();
			const rawValue = rawValueParts.join("=");

			switch (name) {
				case "expires":
					attrObj.expires = rawValue ? new Date(rawValue.trim()) : undefined;
					break;
				case "max-age":
					attrObj["max-age"] = rawValue
						? parseInt(rawValue.trim(), 10)
						: undefined;
					break;
				case "domain":
					attrObj.domain = rawValue ? rawValue.trim() : undefined;
					break;
				case "path":
					attrObj.path = rawValue ? rawValue.trim() : undefined;
					break;
				case "secure":
					attrObj.secure = true;
					break;
				case "httponly":
					attrObj.httponly = true;
					break;
				case "samesite":
					attrObj.samesite = rawValue
						? (rawValue.trim().toLowerCase() as "strict" | "lax" | "none")
						: undefined;
					break;
				default:
					attrObj[name] = rawValue ? rawValue.trim() : true;
					break;
			}
		});

		cookies.set(name, attrObj);
	});

	return cookies;
}

export function setCookieToHeader(headers: Headers) {
	return (context: { response: Response }) => {
		const setCookieHeader = context.response.headers.get("set-cookie");
		if (!setCookieHeader) return;

		const cookieMap = new Map<string, string>();

		// Keep existing cookies
		const existingCookies = headers.get("cookie") || "";
		existingCookies.split(";").forEach((cookieStr) => {
			const [name, ...valueParts] = cookieStr.trim().split("=");
			if (name && valueParts.length > 0) {
				cookieMap.set(name, valueParts.join("="));
			}
		});

		// Apply new cookies
		const parsed = parseSetCookieHeader(setCookieHeader);
		parsed.forEach((cookie, name) => {
			cookieMap.set(name, cookie.value);
		});

		// Rebuild cookie header
		const updatedCookies = Array.from(cookieMap.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");

		headers.set("cookie", updatedCookies);
	};
}
