const IPV4_REGEX =
	/^(?:(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])$/;
const IPV6_REGEX =
	/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!3)::|:\b|$))|(?!23)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;

export function isIP(ip: string | null) {
	return ip !== null && (IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip));
}

function getClientIpFromXForwardedFor(value: string | null): string | null {
	if (!value) {
		return null;
	}
	const addresses = value.split(",").map((ip) => ip.trim());
	for (const ip of addresses) {
		if (isIP(ip)) {
			return ip;
		}
	}
	return null;
}

/**
 * Retrieves the client's IP address from request headers.
 *
 * The function checks various headers commonly used by different cloud providers and proxies to find the client's IP address.
 * It prioritizes the 'x-forwarded-for' header, which may contain multiple IP addresses, and extracts the first one.
 * If no valid IP is found, it returns null.
 *
 * @returns {string|null} The client's IP address.
 */
export function getClientIP(headers: Headers): string | null {
	// X-Forwarded-For (Header may return multiple IP addresses in the format: "client IP, proxy 1 IP, proxy 2 IP", so we take the first one.)
	if (headers.has("x-forwarded-for")) {
		const forwardedIp = getClientIpFromXForwardedFor(
			headers.get("x-forwarded-for"),
		);
		if (forwardedIp) {
			return forwardedIp;
		}
	}

	const headerKeys = [
		// Standard headers used by Amazon EC2, Heroku, and others.
		"x-client-ip",

		// Cloudflare.
		// @docs https://support.cloudflare.com/hc/en-us/articles/200170986-How-does-Cloudflare-handle-HTTP-Request-headers-
		// CF-Connecting-IP - applied to every request to the origin.
		"cf-connecting-ip",

		// Fastly and Firebase hosting header (When forwared to cloud function)
		"fastly-client-ip",

		// Akamai and Cloudflare: True-Client-IP.
		"true-client-ip",

		// X-Real-IP (Nginx proxy/FastCGI)
		"x-real-ip",

		// X-Cluster-Client-IP (Rackspace LB, Riverbed Stingray)
		"x-cluster-client-ip",

		// X-Forwarded, Forwarded-For and Forwarded (Variations of #2)
		"x-forwarded",
		"forwarded-for",
		"forwarded",

		// Google Cloud App Engine
		// https://cloud.google.com/appengine/docs/standard/go/reference/request-response-headers
		"x-appengine-user-ip",

		// Cloudflare fallback
		// https://blog.cloudflare.com/eliminating-the-last-reasons-to-not-enable-ipv6/#introducingpseudoipv4
		"Cf-Pseudo-IPv4",
	];

	for (const headerKey of headerKeys) {
		if (headers.has(headerKey)) {
			const ip = headers.get(headerKey);
			if (ip && isIP(ip)) {
				return ip;
			}
		}
	}

	return null;
}