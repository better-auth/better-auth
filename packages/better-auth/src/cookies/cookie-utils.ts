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

export const SECURE_COOKIE_PREFIX = "__Secure-";
export const HOST_COOKIE_PREFIX = "__Host-";

/**
 * Remove __Secure- or __Host- prefix from cookie name.
 */
export function stripSecureCookiePrefix(cookieName: string): string {
	if (cookieName.startsWith(SECURE_COOKIE_PREFIX)) {
		return cookieName.slice(SECURE_COOKIE_PREFIX.length);
	}
	if (cookieName.startsWith(HOST_COOKIE_PREFIX)) {
		return cookieName.slice(HOST_COOKIE_PREFIX.length);
	}
	return cookieName;
}

/**
 * Split a Set-Cookie header string into individual cookie strings.
 *
 * This function properly handles commas within cookie values, specifically
 * for the `Expires` attribute which contains a date string with a comma
 * (e.g., "Expires=Thu, 01 Jan 2026 00:00:00 GMT").
 *
 * The algorithm tracks when we're inside an Expires attribute and waits
 * until we see "GMT" before considering a comma as a cookie separator.
 *
 * @param setCookie - The Set-Cookie header string (may contain multiple cookies)
 * @returns An array of individual cookie strings
 */
export function splitSetCookieHeader(setCookie: string): string[] {
	const parts: string[] = [];
	let buffer = "";
	let i = 0;
	while (i < setCookie.length) {
		const char = setCookie[i];
		if (char === ",") {
			const recent = buffer.toLowerCase();
			const hasExpires = recent.includes("expires=");
			const hasGmt = /gmt/i.test(recent);
			if (hasExpires && !hasGmt) {
				buffer += char;
				i += 1;
				continue;
			}
			if (buffer.trim().length > 0) {
				parts.push(buffer.trim());
				buffer = "";
			}
			i += 1;
			if (setCookie[i] === " ") i += 1;
			continue;
		}
		buffer += char;
		i += 1;
	}
	if (buffer.trim().length > 0) {
		parts.push(buffer.trim());
	}
	return parts;
}

export function parseSetCookieHeader(
	setCookie: string,
): Map<string, CookieAttributes> {
	const cookies = new Map<string, CookieAttributes>();
	const cookieArray = splitSetCookieHeader(setCookie);

	cookieArray.forEach((cookieString) => {
		const parts = cookieString.split(";").map((part) => part.trim());
		const [nameValue, ...attributes] = parts;
		const [name, ...valueParts] = (nameValue || "").split("=");

		const value = valueParts.join("=");

		if (!name || value === undefined) {
			return;
		}

		const attrObj: CookieAttributes = { value };

		attributes.forEach((attribute) => {
			const [attrName, ...attrValueParts] = attribute!.split("=");
			const attrValue = attrValueParts.join("=");

			const normalizedAttrName = attrName!.trim().toLowerCase();

			switch (normalizedAttrName) {
				case "max-age":
					attrObj["max-age"] = attrValue
						? parseInt(attrValue.trim(), 10)
						: undefined;
					break;
				case "expires":
					attrObj.expires = attrValue ? new Date(attrValue.trim()) : undefined;
					break;
				case "domain":
					attrObj.domain = attrValue ? attrValue.trim() : undefined;
					break;
				case "path":
					attrObj.path = attrValue ? attrValue.trim() : undefined;
					break;
				case "secure":
					attrObj.secure = true;
					break;
				case "httponly":
					attrObj.httponly = true;
					break;
				case "samesite":
					attrObj.samesite = attrValue
						? (attrValue.trim().toLowerCase() as "strict" | "lax" | "none")
						: undefined;
					break;
				default:
					// Handle any other attributes
					attrObj[normalizedAttrName] = attrValue ? attrValue.trim() : true;
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
		if (!setCookieHeader) {
			return;
		}

		const cookieMap = new Map<string, string>();

		const existingCookiesHeader = headers.get("cookie") || "";
		existingCookiesHeader.split(";").forEach((cookie) => {
			const [name, ...rest] = cookie!.trim().split("=");
			if (name && rest.length > 0) {
				cookieMap.set(name, rest.join("="));
			}
		});

		const setCookieHeaders = setCookieHeader.split(",");
		setCookieHeaders.forEach((header) => {
			const cookies = parseSetCookieHeader(header);
			cookies.forEach((value, name) => {
				cookieMap.set(name, value.value);
			});
		});

		const updatedCookies = Array.from(cookieMap.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");
		headers.set("cookie", updatedCookies);
	};
}
