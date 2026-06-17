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

test.describe("multiple domains (HTTP)", () => {
	/**
	 * Identity stays anchored to the canonical `baseURL`: the OAuth issuer in
	 * discovery is the same no matter which trusted host fetches it.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/4151
	 * @see https://github.com/better-auth/better-auth/issues/8447
	 */
	test("oauth metadata issuer is canonical regardless of request host", async () => {
		const { port, stop } = await setupServer(
			{
				baseURL: "https://auth.example.com",
				trustedOrigins: [
					"http://tenant-a.example.com:*",
					"http://tenant-b.example.com:*",
				],
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
				expect(body.issuer).toBe("https://auth.example.com/api/auth");
			}
		} finally {
			await stop();
		}
	});

	/**
	 * A direct `auth.api` call is served when the request arrives on a trusted
	 * non-canonical host (multi-domain serving).
	 *
	 * @see https://github.com/better-auth/better-auth/issues/4151
	 * @see https://github.com/better-auth/better-auth/issues/8478
	 */
	test("direct auth.api calls are served on trusted non-canonical hosts", async () => {
		const { port, stop } = await setupServer({
			baseURL: "https://app.example.com",
			trustedOrigins: [
				"http://tenant-a.localhost:*",
				"http://tenant-b.localhost:*",
			],
		});

		try {
			for (const subdomain of ["tenant-a", "tenant-b"]) {
				const res = await httpGet(
					port,
					"/whoami",
					`${subdomain}.localhost:${port}`,
				);
				expect(res.status).toBe(200);
				const body = JSON.parse(res.body) as { session: unknown };
				expect(body.session).toBeNull();
			}
		} finally {
			await stop();
		}
	});
});
