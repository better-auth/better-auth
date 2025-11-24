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
 * parseSetCookieHeader
 *
 * Robust parser for Set-Cookie header(s). Splits cookies on ", " only when
 * the comma is not inside an Expires= attribute value.
 */
export function parseSetCookieHeader(
	setCookie: string,
): Map<string, CookieAttributes> {
	const cookies = new Map<string, CookieAttributes>();
	if (!setCookie || !setCookie.length) return cookies;

	const lower = setCookie.toLowerCase();
	const parts: string[] = [];
	let current = "";
	let inExpires = false;

	for (let i = 0; i < setCookie.length; i++) {
		const ch = setCookie[i];

		// Detect start of "expires=" (case-insensitive)
		if (!inExpires && lower.substring(i, i + 8) === "expires=") {
			inExpires = true;
		}

		// Split on comma + space only when not inside Expires value
		if (
			!inExpires &&
			ch === "," &&
			i + 1 < setCookie.length &&
			setCookie[i + 1] === " "
		) {
			parts.push(current.trim());
			current = "";
			i++; // skip the following space
			continue;
		}

		current += ch;

		// Expires value ends at the next semicolon (;) — reset flag then
		if (inExpires && ch === ";") {
			inExpires = false;
		}
	}

	if (current.trim()) parts.push(current.trim());

	// Parse each cookie part into name/value + attributes
	for (const cookieString of parts) {
		const segments = cookieString.split(";").map((s) => s.trim());
		const [nameValue, ...attributes] = segments;
		if (!nameValue) continue;

		const [nameRaw, ...valueParts] = nameValue.split("=");
		if (!nameRaw) continue;
		const cookieName = nameRaw.trim();
		const cookieValue = valueParts.join("=");

		const attrObj: CookieAttributes = { value: cookieValue };

		for (const attr of attributes) {
			if (!attr) continue;
			const [rawAttrNameRaw, ...rawAttrValueParts] = attr.split("=");

			// Guard: ensure we have an attribute name before calling trim()
			if (typeof rawAttrNameRaw === "undefined" || rawAttrNameRaw === "") {
				continue;
			}

			const attrName = rawAttrNameRaw.trim().toLowerCase();
			const rawAttrValue = rawAttrValueParts.join("=");

			switch (attrName) {
				case "expires":
					attrObj.expires = rawAttrValue
						? new Date(rawAttrValue.trim())
						: undefined;
					break;
				case "max-age":
					attrObj["max-age"] = rawAttrValue
						? parseInt(rawAttrValue.trim(), 10)
						: undefined;
					break;
				case "domain":
					attrObj.domain = rawAttrValue ? rawAttrValue.trim() : undefined;
					break;
				case "path":
					attrObj.path = rawAttrValue ? rawAttrValue.trim() : undefined;
					break;
				case "secure":
					attrObj.secure = true;
					break;
				case "httponly":
					attrObj.httponly = true;
					break;
				case "samesite":
					attrObj.samesite = rawAttrValue
						? (rawAttrValue.trim().toLowerCase() as "strict" | "lax" | "none")
						: undefined;
					break;
				default:
					attrObj[attrName] = rawAttrValue ? rawAttrValue.trim() : true;
					break;
			}
		}

		cookies.set(cookieName, attrObj);
	}

	return cookies;
}

/**
 * setCookieToHeader
 *
 * Takes existing Headers object (client-side test harness) and appends/updates
 * cookie entries based on the response's Set-Cookie header.
 */
export function setCookieToHeader(headers: Headers) {
	return (context: { response: Response }) => {
		const setCookieHeader = context.response.headers.get("set-cookie");
		if (!setCookieHeader) return;

		const cookieMap = new Map<string, string>();

		// Preserve existing cookies from headers
		const existingCookies = headers.get("cookie") || "";
		existingCookies.split(";").forEach((cookieStr) => {
			const [n, ...vParts] = cookieStr.trim().split("=");
			if (n && vParts.length > 0) {
				cookieMap.set(n, vParts.join("="));
			}
		});

		// Parse new cookies coming from Set-Cookie
		const parsed = parseSetCookieHeader(setCookieHeader);
		parsed.forEach((cookie, name) => {
			cookieMap.set(name, cookie.value);
		});

		// Rebuild cookie header string
		const updatedCookies = Array.from(cookieMap.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");

		headers.set("cookie", updatedCookies);
	};
}
