import { applySetCookies } from "../cookies/cookie-utils";

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

	if (setCookieHeaders.length === 0) return headers;

	applySetCookies(headers, setCookieHeaders);
	return headers;
}
