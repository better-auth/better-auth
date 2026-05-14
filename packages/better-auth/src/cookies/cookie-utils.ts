function tryDecode(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
}

export interface CookieAttributes {
	value: string;
	"max-age"?: number | undefined;
	expires?: Date | undefined;
	domain?: string | undefined;
	path?: string | undefined;
	secure?: boolean | undefined;
	httponly?: boolean | undefined;
	partitioned?: boolean | undefined;
	samesite?: ("strict" | "lax" | "none") | undefined;
	// TODO: tighten to `string | number | boolean | Date | undefined`.
	// Kept as `any` for now to preserve the public type surface.
	[key: string]: any;
}

interface ParsedCookieOptions {
	maxAge?: number | undefined;
	expires?: Date | undefined;
	domain?: string | undefined;
	path?: string | undefined;
	secure?: boolean | undefined;
	httpOnly?: boolean | undefined;
	partitioned?: boolean | undefined;
	sameSite?: CookieAttributes["samesite"];
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
 * Split a comma-joined `Set-Cookie` header string into individual cookies.
 */
export function splitSetCookieHeader(setCookie: string): string[] {
	if (!setCookie) return [];

	const result: string[] = [];
	let start = 0;
	let i = 0;

	while (i < setCookie.length) {
		if (setCookie[i] === ",") {
			let j = i + 1;
			while (j < setCookie.length && setCookie[j] === " ") j++;
			while (
				j < setCookie.length &&
				setCookie[j] !== "=" &&
				setCookie[j] !== ";" &&
				setCookie[j] !== ","
			) {
				j++;
			}

			if (j < setCookie.length && setCookie[j] === "=") {
				const part = setCookie.slice(start, i).trim();
				if (part) result.push(part);
				start = i + 1;
				while (start < setCookie.length && setCookie[start] === " ") start++;
				i = start;
				continue;
			}
		}

		i++;
	}

	const last = setCookie.slice(start).trim();
	if (last) result.push(last);

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

		const decodedValue = value.includes("%") ? tryDecode(value) : value;
		const attrObj: CookieAttributes = { value: decodedValue };

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
				case "partitioned":
					attrObj.partitioned = true;
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

export function toCookieOptions(
	attributes: CookieAttributes,
): ParsedCookieOptions {
	return {
		maxAge: attributes["max-age"],
		expires: attributes.expires,
		domain: attributes.domain,
		path: attributes.path,
		secure: attributes.secure,
		httpOnly: attributes.httponly,
		sameSite: attributes.samesite,
		partitioned: attributes.partitioned,
	};
}

/**
 * Cookie-name token char set per RFC 7230 §3.2.6.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6
 */
const cookieNameRegex = /^[\w!#$%&'*.^`|~+-]+$/;

/**
 * Cookie-value char set per RFC 6265 §4.1.1, plus space and comma.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.1
 * @see https://github.com/golang/go/issues/7243
 */
const cookieValueRegex = /^[ !#-:<-[\]-~]*$/;

/**
 * Trim leading/trailing OWS (space / horizontal tab) per RFC 7230 §3.2.3.
 * Narrower than `String.prototype.trim()`, which strips CR/LF and other
 * whitespace and would let CTLs escape `cookieValueRegex`.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.3
 */
function trimOWS(s: string): string {
	let start = 0;
	let end = s.length;
	while (start < end) {
		const c = s.charCodeAt(start);
		if (c !== 0x20 && c !== 0x09) break;
		start++;
	}
	while (end > start) {
		const c = s.charCodeAt(end - 1);
		if (c !== 0x20 && c !== 0x09) break;
		end--;
	}
	return start === 0 && end === s.length ? s : s.slice(start, end);
}

/**
 * Tolerates `;` separators without the SP that RFC 6265 §4.2.1 mandates,
 * since proxies and runtimes commonly strip it. Silently drops entries
 * whose name violates RFC 7230 token or whose value violates RFC 6265
 * cookie-octet (plus space and comma). Strips optional surrounding
 * double-quotes per RFC 6265 §4.1.1.
 */
export function parseCookies(cookie: string): Map<string, string> {
	const cookieMap = new Map<string, string>();
	if (cookie.length < 2) return cookieMap;
	for (const chunk of cookie.split(";")) {
		const eq = chunk.indexOf("=");
		if (eq === -1) continue;
		const key = trimOWS(chunk.slice(0, eq));
		let val = trimOWS(chunk.slice(eq + 1));
		if (val.length >= 2 && val[0] === '"' && val[val.length - 1] === '"') {
			val = val.slice(1, -1);
		}
		if (cookieNameRegex.test(key) && cookieValueRegex.test(val)) {
			cookieMap.set(key, val);
		}
	}
	return cookieMap;
}

/**
 * Add or replace a cookie in the request `Cookie` header.
 *
 * Cookie pairs are joined with `; `, but `headers.append("cookie", ...)`
 * joins with `, ` in some runtimes (e.g. Deno, Cloudflare Workers) and
 * breaks downstream cookie parsing. This builds the header value via
 * parse-mutate-serialize.
 */
export function setRequestCookie(
	headers: Headers,
	name: string,
	value: string,
): void {
	const cookieMap = parseCookies(headers.get("cookie") || "");
	cookieMap.set(name, value);
	headers.set(
		"cookie",
		Array.from(cookieMap, ([k, v]) => `${k}=${v}`).join("; "),
	);
}

/**
 * Merge `Set-Cookie` header values into the target's `Cookie` header.
 * Mutates `target`.
 *
 * Name/value-level merge only. RFC 6265 §5 user-agent semantics
 * (expiration, domain/path scoping, ordering) are out of scope. Suitable
 * for single-request proxy, middleware, and test contexts.
 */
export function applySetCookies(
	target: Headers,
	setCookieValues: Iterable<string>,
): void {
	const cookieMap = parseCookies(target.get("cookie") || "");
	for (const setCookie of setCookieValues) {
		for (const [name, attr] of parseSetCookieHeader(setCookie)) {
			cookieMap.set(name, attr.value);
		}
	}
	target.set(
		"cookie",
		Array.from(cookieMap, ([k, v]) => `${k}=${v}`).join("; "),
	);
}

export function setCookieToHeader(headers: Headers) {
	return (context: { response: Response }) => {
		const setCookieHeader = context.response.headers.get("set-cookie");
		if (!setCookieHeader) return;
		applySetCookies(headers, [setCookieHeader]);
	};
}
