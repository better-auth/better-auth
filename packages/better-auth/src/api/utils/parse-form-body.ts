import { APIError } from "better-call";

/**
 * Allowed endpoints that support form-based authentication
 */
const FORM_ALLOWED_ENDPOINTS = ["/sign-in/email", "/sign-up/email"] as const;

/**
 * Check if an endpoint allows form-based content types
 */
export function isFormAllowedEndpoint(path: string): boolean {
	return FORM_ALLOWED_ENDPOINTS.some((endpoint) => path === endpoint);
}

/**
 * Check if the content type is a form type
 */
export function isFormContentType(contentType: string): boolean {
	return contentType.startsWith("application/x-www-form-urlencoded");
}

/**
 * Check if the content type is JSON
 */
export function isJsonContentType(contentType: string): boolean {
	return contentType.startsWith("application/json");
}

/**
 * Parse form data from a request and convert it to a JSON-like object.
 */
export async function parseFormBody(
	request: Request,
): Promise<Record<string, string>> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.startsWith("application/x-www-form-urlencoded")) {
		const text = await request.text();
		const params = new URLSearchParams(text);
		const body: Record<string, string> = {};
		const seenKeys = new Set<string>();

		for (const [key, value] of params.entries()) {
			// Detect duplicate keys - this is likely malicious or an error
			if (seenKeys.has(key)) {
				throw new APIError("BAD_REQUEST", {
					message: `Duplicate form field: "${key}". Each field must appear only once.`,
				});
			}
			seenKeys.add(key);
			body[key] = value;
		}

		return body;
	}

	throw new APIError("BAD_REQUEST", {
		message: "Unsupported content type for form parsing",
	});
}

/**
 * Create a new Request with JSON body from form data.
 */
export async function convertFormRequestToJson(
	request: Request,
): Promise<Request> {
	// Clone before reading - Request bodies are single-use streams
	const clonedRequest = request.clone();
	const formBody = await parseFormBody(clonedRequest);
	const jsonBody = JSON.stringify(formBody);

	const newHeaders = new Headers(request.headers);
	newHeaders.set("content-type", "application/json");

	try {
		JSON.parse(jsonBody);
	} catch (e) {
		throw new APIError("BAD_REQUEST", {
			message: "Failed to serialize form data to JSON",
			details: e,
		});
	}

	return new Request(request.url, {
		method: request.method,
		headers: newHeaders,
		body: jsonBody,
		redirect: request.redirect,
		referrer: request.referrer,
		referrerPolicy: request.referrerPolicy,
		signal: request.signal,
		mode: request.mode,
		credentials: request.credentials,
		cache: request.cache,
		integrity: request.integrity,
		keepalive: request.keepalive,
	});
}
