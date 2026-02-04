export interface CookieAttributes {
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
 * Split `Set-Cookie` header, handling commas in `Expires` dates.
 */
export function splitSetCookieHeader(setCookie: string): string[] {
	if (!setCookie) return [];

	const result: string[] = [];
	let current = "";
	let i = 0;

	while (i < setCookie.length) {
		const c = setCookie[i];

		if (c === ",") {
			const lower = current.toLowerCase();
			if (lower.includes("expires=") && !lower.includes("gmt")) {
				current += c;
				i++;
			} else {
				const trimmed = current.trim();
				if (trimmed) {
					result.push(trimmed);
				}
				current = "";
				i++;
				if (i < setCookie.length && setCookie[i] === " ") {
					i++;
				}
			}
			continue;
		}

		current += c;
		i++;
	}

	const trimmed = current.trim();
	if (trimmed) {
		result.push(trimmed);
	}

	return result;
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

		const cookies = parseSetCookieHeader(setCookieHeader);
		cookies.forEach((value, name) => {
			cookieMap.set(name, value.value);
		});

		const updatedCookies = Array.from(cookieMap.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");
		headers.set("cookie", updatedCookies);
	};
}
