interface CookieAttributes {
	value: string;
	maxAge?: number;
	expires?: Date;
	domain?: string;
	path?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: "strict" | "lax" | "none";
	[key: string]: any;
}

export function parseSetCookieHeader(
	setCookie: string,
): Map<string, CookieAttributes> {
	const cookies = new Map<string, CookieAttributes>();
	const cookieArray = setCookie.split(", ");

	cookieArray.forEach((cookieString) => {
		const parts = cookieString.split(";").map((part) => part.trim());
		const [nameValue, ...attributes] = parts;
		const [name, ...valueParts] = nameValue.split("=");

		const value = valueParts.join("=");

		if (!name || value === undefined) {
			console.warn(`Malformed cookie: ${cookieString}`);
			return;
		}

		const attrObj: CookieAttributes = { value };

		attributes.forEach((attribute) => {
			const [attrName, ...attrValueParts] = attribute.split("=");
			const attrValue = attrValueParts.join("=");

			// Normalize the attribute name to camelCase
			const normalizedAttrName = attrName
				.trim()
				.toLowerCase()
				.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

			switch (normalizedAttrName) {
				case "maxAge":
					attrObj.maxAge = attrValue
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
					attrObj.httpOnly = true;
					break;
				case "samesite":
					attrObj.sameSite = attrValue
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
