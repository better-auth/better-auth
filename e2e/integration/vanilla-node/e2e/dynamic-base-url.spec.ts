import * as http from "node:http";
import { expect, test } from "@playwright/test";
import { setupServer } from "./utils";

type HttpResponse = {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
};

// Node's built-in `fetch` forbids overriding the `Host` header. Use
// `http.request` so the server sees the per-tenant host we send rather than
// the one Node derives from the connection target.
function httpGet(
	port: number,
	path: string,
	hostHeader: string,
): Promise<HttpResponse> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				path,
				method: "GET",
				headers: { host: hostHeader },
			},
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => (body += chunk));
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body,
					}),
				);
			},
		);
		req.on("error", reject);
		req.end();
	});
}

test.describe("dynamic baseURL (HTTP)", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/8447
	 */
	test("oauthProviderAuthServerMetadata resolves issuer from request host", async () => {
		const { port, stop } = await setupServer(
			{
				baseURL: {
					// Non-loopback hosts: `validateIssuerUrl` must upgrade the
					// advertised issuer to https per RFC 9207, even though the
					// configured protocol is http and the wire request is HTTP.
					// `:*` makes the ephemeral test port match the pattern.
					allowedHosts: ["tenant-a.example.com:*", "tenant-b.example.com:*"],
					protocol: "http",
					fallback: "http://fallback.example.com",
				},
			},
			{ oauthProvider: true, disableTestUser: true },
		);

		try {
			for (const subdomain of ["tenant-a", "tenant-b"]) {
				const host = `${subdomain}.example.com:${port}`;
				const res = await httpGet(
					port,
					"/.well-known/oauth-authorization-server",
					host,
				);
				expect(res.status).toBe(200);
				const body = JSON.parse(res.body) as { issuer?: string };
				// `validateIssuerUrl` forces https for non-loopback hostnames (RFC 9207).
				expect(body.issuer).toBe(`https://${host}/api/auth`);
			}
		} finally {
			await stop();
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9105
	 */
	test("direct auth.api calls resolve baseURL from forwarded headers", async () => {
		const { port, stop } = await setupServer({
			baseURL: {
				// `:*` so the ephemeral test port matches the pattern; without it
				// resolution falls through to `fallback` and the test would pass
				// even if per-request resolution were broken.
				allowedHosts: ["tenant-a.localhost:*", "tenant-b.localhost:*"],
				protocol: "http",
				fallback: "http://fallback.localhost",
			},
		});

		try {
			const res = await httpGet(port, "/whoami", `tenant-a.localhost:${port}`);
			expect(res.status).toBe(200);
			const body = JSON.parse(res.body) as { session: unknown };
			expect(body.session).toBeNull();
		} finally {
			await stop();
		}
	});

	/**
	 * Direct `auth.api` call with no forwarded source and no `fallback` must
	 * surface a structured `APIError` message rather than silently leaving
	 * `ctx.context.baseURL = ""` for downstream code to crash on.
	 */
	test("direct auth.api call without source or fallback returns a clear error", async () => {
		const { port, stop } = await setupServer(
			{
				baseURL: {
					allowedHosts: ["tenant-a.localhost:*"],
					protocol: "http",
				},
			},
			{ disableTestUser: true },
		);

		try {
			const res = await httpGet(
				port,
				"/whoami-no-source",
				`tenant-a.localhost:${port}`,
			);
			expect(res.status).toBe(500);
			const body = JSON.parse(res.body) as { error?: string };
			expect(body.error).toMatch(/baseURL|headers|fallback/i);
		} finally {
			await stop();
		}
	});
});
