import { BetterAuthError } from "@better-auth/core/error";
import type { CookieOptions } from "better-call";

export const ALLOWED_COOKIE_SIZE = 4096;

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

export function estimateEmptyCookieSize(
	name: string,
	attributes: CookieOptions,
) {
	const path = attributes.path ?? "/";
	let s = `${name}=`;
	s += `; Path=${path}`;
	if (attributes.httpOnly) {
		s += "; HttpOnly";
	}
	const sameSite = attributes.sameSite ?? "lax";
	s += `; SameSite=${sameSite}`;
	if (attributes.maxAge != null) {
		s += `; Max-Age=${attributes.maxAge}`;
	} else if (attributes.expires) {
		const expires =
			typeof attributes.expires === "number"
				? new Date(attributes.expires * 1000).toUTCString()
				: (attributes.expires as Date).toUTCString();
		s += `; Expires=${expires}`;
	}
	if (attributes.secure) {
		s += "; Secure";
	}
	if (attributes.domain) {
		s += `; Domain=${attributes.domain}`;
	}
	return s.length;
}

export function getMaxCookieValueSize(name: string, attributes: CookieOptions) {
	const size = ALLOWED_COOKIE_SIZE - estimateEmptyCookieSize(name, attributes);
	if (size <= 0) {
		throw new BetterAuthError(`Cookie ${name} is too large to be chunked.`);
	}
	return size;
}
