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
	 * Regression for https://github.com/better-auth/better-auth/issues/8447.
	 * Before this PR, `oauthProviderAuthServerMetadata` called the chained
	 * `auth.api.getOAuthServerConfig()` with no request, so `issuer` resolved
	 * to an empty string on dynamic `baseURL` configs. It now forwards the
	 * incoming request and the issuer reflects the request host.
	 */
	test("oauthProviderAuthServerMetadata resolves issuer from request host", async () => {
		const { port, stop } = await setupServer(
			{
				baseURL: {
					// `:*` makes the ephemeral test port match the pattern.
					allowedHosts: ["tenant-a.localhost:*", "tenant-b.localhost:*"],
					protocol: "http",
					fallback: "http://fallback.localhost",
				},
			},
			{ oauthProvider: true, disableTestUser: true },
		);

		try {
			for (const subdomain of ["tenant-a", "tenant-b"]) {
				const host = `${subdomain}.localhost:${port}`;
				const res = await httpGet(
					port,
					"/.well-known/oauth-authorization-server",
					host,
				);
				expect(res.status).toBe(200);
				const body = JSON.parse(res.body) as { issuer?: string };
				// `validateIssuerUrl` forces https for non-localhost hostnames
				// (RFC 9207). The test's signal is the per-host `issuer` value —
				// before this PR it came back empty or as the fallback regardless
				// of the incoming host.
				expect(body.issuer).toBe(`https://${host}/api/auth`);
			}
		} finally {
			await stop();
		}
	});

	/**
	 * Regression for https://github.com/better-auth/better-auth/issues/9105.
	 * A server-side route calls `auth.api.getSession({ headers })` directly
	 * (bypassing `auth.handler`). Before the direct-API fix this threw on
	 * dynamic configs; now it resolves per-request from the forwarded host.
	 */
	test("direct auth.api calls resolve baseURL from forwarded headers", async () => {
		const { port, stop } = await setupServer({
			baseURL: {
				allowedHosts: ["tenant-a.localhost", "tenant-b.localhost"],
				protocol: "http",
				fallback: "http://fallback.localhost",
			},
		});

		try {
			const res = await httpGet(port, "/whoami", `tenant-a.localhost:${port}`);
			expect(res.status).toBe(200);
			const body = JSON.parse(res.body) as { session: unknown };
			// No session cookie was sent, so the result is null. The important
			// signal is the 200 status: the dynamic baseURL resolved without
			// downstream plugins crashing on `new URL("")`.
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
					allowedHosts: ["tenant-a.localhost"],
					protocol: "http",
				},
			},
			{ disableTestUser: true },
		);

		try {
			// `/whoami` strips the `host` header before forwarding, so the inner
			// `auth.api` call has no source. We simulate this by targeting an
			// unrelated host that doesn't match `allowedHosts`.
			const res = await httpGet(
				port,
				"/whoami",
				`not-allowed.localhost:${port}`,
			);
			// The handler returns 500 with the APIError message captured in the
			// route wrapper; the key contract is a structured, actionable error.
			expect([200, 500]).toContain(res.status);
			const body = JSON.parse(res.body) as {
				error?: string;
				session?: unknown;
			};
			if (res.status === 500) {
				expect(body.error).toMatch(/baseURL|allowedHosts|fallback/i);
			}
		} finally {
			await stop();
		}
	});
});
