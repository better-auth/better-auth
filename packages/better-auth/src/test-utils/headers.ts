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

	if (setCookieHeaders.length === 0) {
		return headers;
	}

	const existingCookies = headers.get("cookie") || "";
	const cookies = existingCookies ? existingCookies.split("; ") : [];

	setCookieHeaders.forEach((setCookie) => {
		const cookiePair = setCookie.split(";")[0]!;
		cookies.push(cookiePair.trim());
	});

	headers.set("cookie", cookies.join("; "));

	return headers;
}
