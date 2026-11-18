import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestOptions } from "node:https";
import { isIP } from "node:net";
import type { TLSSocket } from "node:tls";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Real TLS handshakes against a local server whose certificate names only an
 * IP address. The host classifier is stubbed to treat the loopback literal as
 * public and the client trusts the server's certificate, so the only thing
 * under test is that an IP-literal host verifies by certificate identity and
 * sends no SNI.
 */
const trust = vi.hoisted(() => ({ ca: "" }));

vi.mock(import("@better-auth/core/utils/host"), async (importOriginal) => ({
	...(await importOriginal()),
	classifyHost: (host: string) => {
		const canonical = host.replace(/^\[|\]$/g, "");
		return {
			kind: "public",
			literal: isIP(canonical) === 6 ? "ipv6" : "ipv4",
			canonical,
		};
	},
}));
vi.mock(import("node:https"), async (importOriginal) => {
	const actual = await importOriginal();
	const request = (
		url: URL,
		options: RequestOptions,
		callback: (response: IncomingMessage) => void,
	) => actual.request(url, { ...options, ca: trust.ca }, callback);
	return { ...actual, request: request as typeof actual.request };
});

import { fetchClientMetadataResource } from "./node";

interface Seen {
	host: string | undefined;
	servername: string | false | null;
}

const seen: Seen[] = [];
let server: Listener | undefined;

function handler(req: IncomingMessage, res: ServerResponse) {
	seen.push({
		host: req.headers.host,
		servername: (req.socket as TLSSocket).servername,
	});
	res.setHeader("content-type", "application/json");
	res.end(JSON.stringify({ ok: true }));
}

async function serve(
	hostname: string,
	domains: string[],
	onRequest: typeof handler = handler,
) {
	server = await listen(onRequest, {
		hostname,
		https: { domains },
		port: { random: true },
		showURL: false,
	});
	if (!server.https) throw new Error("expected an HTTPS listener");
	trust.ca = server.https.cert;
	return new URL(server.url);
}

afterEach(async () => {
	seen.length = 0;
	await server?.close();
	server = undefined;
});

describe("Node CIMD metadata transport over TLS to an IP literal", () => {
	it.each([
		["127.0.0.1", "127.0.0.1"],
		["::1", "[::1]"],
	])(
		"verifies the certificate for %s and sends no SNI",
		async (address, authority) => {
			const origin = await serve(address, [address]);

			const response = await fetchClientMetadataResource(
				`https://${authority}:${origin.port}/client.json`,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			expect(seen).toEqual([
				{ host: `${authority}:${origin.port}`, servername: false },
			]);
		},
	);

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11609
	 */
	it("rejects a protocol upgrade the request did not ask for", async () => {
		let serverSocketClosed: Promise<void> | undefined;
		const origin = await serve("127.0.0.1", ["127.0.0.1"], (req) => {
			serverSocketClosed = new Promise((resolve) => {
				req.socket.once("close", () => resolve());
			});
			req.socket.write(
				"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: example\r\n\r\n",
			);
		});

		await expect(
			fetchClientMetadataResource(
				`https://127.0.0.1:${origin.port}/client.json`,
				{ signal: AbortSignal.timeout(1_000) },
			),
		).rejects.toThrow("protocol upgrade");
		await serverSocketClosed;
	}, 3_000);

	it("rejects a certificate that does not name the IP address", async () => {
		const origin = await serve("127.0.0.1", ["127.0.0.2"]);

		await expect(
			fetchClientMetadataResource(
				`https://127.0.0.1:${origin.port}/client.json`,
			),
		).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
		expect(seen).toEqual([]);
	});
});
