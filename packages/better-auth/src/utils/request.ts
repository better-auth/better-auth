import { type IncomingHttpHeaders, IncomingMessage } from "node:http";
import { z } from "zod";
import { InvalidRequest, InvalidURL } from "@better-auth/shared/error";
import type { BetterAuthOptions } from "../options";

export async function getBody<T>(request: IncomingMessage | Request) {
	try {
		if (request instanceof Request) return await request.json();
		return new Promise<T>((resolve) => {
			const bodyParts: any[] = [];
			let body: string;
			request
				.on("data", (chunk) => {
					bodyParts.push(chunk);
				})
				.on("end", () => {
					body = Buffer.concat(bodyParts).toString();
					resolve(JSON.parse(body));
				});
		});
	} catch {
		throw new InvalidRequest();
	}
}

export const toRequestHeader = (
	incomingHeaders: IncomingHttpHeaders | Headers,
): Headers => {
	if (incomingHeaders instanceof Headers) return incomingHeaders;
	const headers = new Headers();
	for (const [key, value] of Object.entries(incomingHeaders)) {
		if (Array.isArray(value)) {
			for (const val of value) {
				headers.append(key, val);
			}
		} else if (value) {
			headers.append(key, value);
		}
	}
	return headers;
};
function getUrl(request: IncomingMessage | Request) {
	const url =
		request instanceof IncomingMessage
			? `${request.headers.host}${(request as any).originalUrl}`
			: request.url;
	return new URL(url);
}

export function isValidHttpMethod(method?: string) {
	if (method?.toUpperCase() !== "POST" && method?.toUpperCase() !== "GET") {
		return false;
	}
	return true;
}

export type InternalURL = {
	origin: string;
	host: string;
	path: string;
	base: string;
	toString: () => string;
};
export function parseUrl(
	request: IncomingMessage | Request,
	options: BetterAuthOptions,
) {
	let requestStringURL =
		request instanceof IncomingMessage
			? `${request.headers.host}${request.url}`
			: request.url;
	if (!requestStringURL.startsWith("http")) {
		if (requestStringURL.startsWith("localhost")) {
			requestStringURL = `http://${requestStringURL}`;
		} else {
			requestStringURL = `https://${requestStringURL}`;
		}
	}
	const requestURL = new URL(requestStringURL);
	const baseURL = requestURL.origin;
	const basePath = options.basePath || "/api/auth";
	let urlString = `${baseURL}${basePath}`;
	if (!urlString.startsWith("http")) {
		urlString = `https://${urlString}`;
	}
	const isValidURL = z.string().url().safeParse(urlString);
	let action = requestURL.pathname.split(basePath)[1] || "";
	//replace the first / in the action
	action = action.replace("/", "");
	if (isValidURL.error) {
		throw new InvalidURL();
	}
	/**
	 * If the action is a callback, we need to extract the
	 * provider form the URL.
	 */
	if (action.startsWith("callback")) {
		const provider = action.split("/")[1];
		if (!provider) throw new InvalidURL("Provider is missing in the URL.");
		action = "callback";
		requestURL.searchParams.set("provider", provider);
	}
	const url = new URL(urlString);
	requestURL.searchParams.forEach((value, key) => {
		url.searchParams.set(key, value);
	});
	return {
		url,
		action,
	};
}

export function isAuthPath(url: string, options: BetterAuthOptions) {
	const _url = new URL(url);
	const baseURL = new URL(options.baseURL || _url.origin);
	const basePath = options.basePath || "/api/auth";
	if (_url.origin !== baseURL.origin) return false;
	if (!_url.pathname.startsWith(basePath)) return false;
	return true;
}
