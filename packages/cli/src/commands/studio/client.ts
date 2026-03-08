import { Buffer } from "node:buffer";
import type { WebSocket } from "ws";
import type { TunnelEvent } from "./schemas";
import { isTunnelEvent } from "./schemas";

export type RequestContext = {
	startedAt: number;
	method: string;
	duration: number;
};

export type TunnelClientOptions = {
	to: string;
	onReady?: (event: TunnelEvent<"ready">) => void;
	onRequest?: (event: TunnelEvent<"request">, ctx: RequestContext) => void;
	onResponse?: (event: TunnelEvent<"response">, ctx: RequestContext) => void;
	onError?: (error: Error) => void;
};

/**
 * Runs the tunnel client.
 *
 * This function will listen for requests on the WebSocket and forwards them to the local server.
 * It will also listen for responses from the local server and forwards them back to the client.
 *
 * @param ws - The WebSocket to use.
 * @param options - The options for the tunnel client.
 */
export async function runTunnel(ws: WebSocket, options: TunnelClientOptions) {
	const { to, onReady, onRequest, onResponse, onError } = options;
	let tunnelReady = false;
	const requestTimers = new Map<number, { start: number; method: string }>();

	ws.on("message", async (data) => {
		const raw =
			typeof data === "string"
				? data
				: Buffer.isBuffer(data)
					? data.toString("utf-8")
					: new TextDecoder().decode(
							data instanceof ArrayBuffer ? data : Buffer.concat(data),
						);

		let parsed: unknown = null;
		try {
			parsed = JSON.parse(raw);
		} catch (_: unknown) {
			void _;
		}

		const msg =
			parsed &&
			typeof parsed === "object" &&
			"result" in parsed &&
			(parsed as { result?: unknown }).result !== undefined
				? (parsed as { result: unknown }).result
				: parsed;
		if (!tunnelReady) {
			if (msg && isTunnelEvent(msg, "ready")) {
				tunnelReady = true;
				onReady?.(msg);
				return;
			}
			if (msg && typeof msg === "object" && "error" in msg) {
				onError?.(new Error(JSON.stringify((msg as { error: unknown }).error)));
				return;
			}
			return;
		}

		if (!isTunnelEvent(msg, "request")) return;
		const { id, method, headers, body } = msg;
		const startedAt = performance.now();
		requestTimers.set(id, { start: startedAt, method });
		onRequest?.(msg, { startedAt, method, duration: 0 });

		const localUrl = buildLocalUrl(to, msg);
		const headersObj = headersToObj(headers);
		const bodyBytes =
			body !== "" && body !== null ? Buffer.from(body, "base64") : undefined;

		let status: number;
		let responseHeaders: [string, string][];
		let responseBody: string | null;

		try {
			const res = await fetch(localUrl, {
				method,
				headers: {
					...headersObj,
					...(bodyBytes ? { "content-length": String(bodyBytes.length) } : {}),
				},
				body: bodyBytes,
			});

			status = res.status;
			const hopByHop = new Set([
				"content-encoding",
				"content-length",
				"transfer-encoding",
			]);
			responseHeaders = (
				Array.from(res.headers.entries()) as [string, string][]
			).filter(([key]) => !hopByHop.has(key.toLowerCase()));
			const buf = await res.arrayBuffer();
			responseBody =
				buf.byteLength > 0 ? Buffer.from(buf).toString("base64") : null;
		} catch (err: any) {
			const errMsg = err.message || "An unknown error occurred";
			onError?.(err instanceof Error ? err : new Error(errMsg));
			status = 502;
			responseHeaders = [["content-type", "text/plain"]];
			responseBody = Buffer.from(errMsg).toString("base64");
		}

		const response = {
			type: "response" as const,
			id,
			status,
			path: localUrl.pathname,
			headers: responseHeaders,
			body: responseBody,
		} satisfies TunnelEvent;
		const timer = requestTimers.get(id);
		requestTimers.delete(id);
		const duration = timer ? Math.round(performance.now() - timer.start) : 0;
		onResponse?.(response, {
			startedAt: timer?.start ?? performance.now(),
			method: timer?.method ?? method,
			duration,
		});
		ws.send(JSON.stringify({ id: 2, method: "tunnel", params: response }));
	});
}

// ===== Utilities =====

/**
 * Builds the local URL to forward the request to.
 *
 * @param to - The URL to forward the request to.
 * @param event - The request event.
 * @returns The local URL.
 */
function buildLocalUrl(to: string, event: TunnelEvent<"request">) {
	const { path, query } = event;

	const url = new URL(to);
	url.pathname = path || "/";
	url.search = query;
	return url;
}

/**
 * Converts an array of headers to an object and
 * excludes headers that are not allowed to be forwarded.
 *
 * @param entries - The headers to convert.
 * @returns The object.
 */
function headersToObj(entries: [string, string][]) {
	const result: Record<string, string> = {};
	for (const [key, value] of entries) {
		const lower = key.toLowerCase();
		if (lower === "host" || lower === "connection") continue;
		result[key] = value;
	}
	return result;
}
