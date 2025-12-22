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

/**
 * Split a combined Set-Cookie header value into individual cookie strings.
 * Handles commas inside Expires attribute values (e.g., "Wed, 21 Oct 2015 ...").
 */
function splitSetCookieHeader(header: string): string[] {
	const parts: string[] = [];
	let current = "";
	let inExpires = false;
	for (let i = 0; i < header.length; i++) {
		const ch = header[i]!;
		// Detect start of Expires attribute (case-insensitive)
		if (!inExpires) {
			if (header.slice(i).toLowerCase().startsWith("expires=")) {
				inExpires = true;
			}
		} else {
			// Expires attribute ends at ';' or end of string
			if (ch === ";") {
				inExpires = false;
			}
		}
		// Split on commas that are NOT within an Expires attribute value
		if (ch === "," && !inExpires) {
			if (current.trim().length > 0) {
				parts.push(current.trim());
			}
			current = "";
			continue;
		}
		current += ch;
	}
	if (current.trim().length > 0) {
		parts.push(current.trim());
	}
	return parts;
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

		const setCookieHeaders = splitSetCookieHeader(setCookieHeader);
		setCookieHeaders.forEach((headerValue) => {
			const cookies = parseSetCookieHeader(headerValue);
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
