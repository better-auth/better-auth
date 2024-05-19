import type { Context } from "../routes/types";
import type { CookieSerializeOptions } from "./types";

export function serialize(
	name: string,
	value: string,
	attributes: CookieSerializeOptions,
) {
	const keyValueEntries: Array<[string, string] | [string]> = [];
	keyValueEntries.push([encodeURIComponent(name), encodeURIComponent(value)]);
	if (attributes?.domain !== undefined) {
		keyValueEntries.push(["Domain", attributes.domain]);
	}
	if (attributes?.expires !== undefined) {
		keyValueEntries.push(["Expires", attributes.expires.toUTCString()]);
	}
	if (attributes?.httpOnly) {
		keyValueEntries.push(["HttpOnly"]);
	}
	if (attributes?.maxAge !== undefined) {
		keyValueEntries.push(["Max-Age", attributes.maxAge.toString()]);
	}
	if (attributes?.path !== undefined) {
		keyValueEntries.push(["Path", attributes.path]);
	}
	if (attributes?.sameSite === "lax") {
		keyValueEntries.push(["SameSite", "Lax"]);
	}
	if (attributes?.sameSite === "none") {
		keyValueEntries.push(["SameSite", "None"]);
	}
	if (attributes?.sameSite === "strict") {
		keyValueEntries.push(["SameSite", "Strict"]);
	}
	if (attributes?.secure) {
		keyValueEntries.push(["Secure"]);
	}
	return keyValueEntries.map((pair) => pair.join("=")).join("; ");
}

export function parse(header: string): Map<string, string> {
	const cookies = new Map<string, string>();
	const items = header.split("; ");
	for (const item of items) {
		const pair = item.split("=");
		const rawKey = pair[0];
		const rawValue = pair[1] ?? "";
		if (!rawKey) continue;
		cookies.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue));
	}
	return cookies;
}

export const cookieManager = (header: Headers): CookieManager => {
	return {
		set(name: string, value: string, options = {}) {
			const cookieStr = serialize(name, value, options);
			header.append("set-cookie", cookieStr);
		},
		get(name: string) {
			const cookie = header.get("cookie");
			if (!cookie) return null;
			const cookies = parse(cookie);
			const value = cookies.get(name);
			return value;
		},
	};
};

export type CookieManager = {
	set: (name: string, value: string, options?: CookieSerializeOptions) => void;
	get: (name: string) => string | null | undefined;
};

export function setSessionCookie(context: Context, sessionId: string) {
	context.request.cookies.set(
		context.cookies.sessionToken.name,
		sessionId,
		context.cookies.sessionToken.options,
	);
}

export function deleteSessionCooke(context: Context) {
	context.request.cookies.set(context.cookies.sessionToken.name, "", {
		...context.cookies.sessionToken.options,
		maxAge: 0,
	});
}
