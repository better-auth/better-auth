export function safeCloneRequest(request?: Request): Request | undefined {
	if (!request) {
		return undefined;
	}

	try {
		return request.clone();
	} catch {
		return new Request(request.url, {
			cache: request.cache,
			credentials: request.credentials,
			headers: request.headers,
			integrity: request.integrity,
			keepalive: request.keepalive,
			method: request.method,
			mode: request.mode,
			redirect: request.redirect,
			referrer: request.referrer,
			referrerPolicy: request.referrerPolicy,
			signal: request.signal,
		});
	}
}
