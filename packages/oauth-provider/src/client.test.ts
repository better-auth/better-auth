import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { setSignedOAuthQueryParameterNames } from "./signed-query";

describe("oauthProviderClient", async () => {
	const { client } = await getTestInstance(
		{},
		{
			clientOptions: {
				plugins: [oauthProviderClient()],
			},
		},
	);

	function stubPage(search: string) {
		vi.stubGlobal("window", { location: { search } });
	}

	function stubSignedPage() {
		const params = new URLSearchParams({ client_id: "client-a" });
		setSignedOAuthQueryParameterNames(params);
		params.set("sig", "test-sig");
		// Not covered by the signature, so it must stay out of `oauth_query`.
		params.set("tab", "profile");
		stubPage(`?${params}`);
	}

	async function send(init: {
		body?: unknown;
		headers?: Record<string, string>;
	}) {
		const customFetchImpl = vi.fn(
			async (_input: string | URL | Request, _init?: RequestInit) =>
				Response.json({}),
		);
		await client.$fetch("/custom", {
			method: "POST",
			...init,
			customFetchImpl,
		});
		return customFetchImpl.mock.calls[0]![1]!.body;
	}

	function expectSignedQuery(value: unknown) {
		const params = new URLSearchParams(String(value));
		expect(params.get("sig")).toBe("test-sig");
		expect(params.get("client_id")).toBe("client-a");
		expect(params.has("tab")).toBe(false);
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("on a page whose query is not a signed OAuth query", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("sends a JSON body unchanged", async () => {
			stubPage("?tab=profile");
			const body = { at: "2026-10-27T10:00:00.123456Z" };

			expect(await send({ body })).toBe(JSON.stringify(body));
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("sends a form body unchanged", async () => {
			stubPage("?tab=profile");

			expect(
				await send({
					body: "a=1&a=2",
					headers: {
						"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
					},
				}),
			).toBe("a=1&a=2");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("sends a query without a signature unchanged", async () => {
			stubPage("?client_id=client-a&ba_param=client_id&ba_param=ba_param");
			const body = { name: "Ada" };

			expect(await send({ body })).toBe(JSON.stringify(body));
		});
	});

	describe("on a page with a signed OAuth query", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("appends oauth_query to an object body and keeps its values", async () => {
			stubSignedPage();

			const sent = JSON.parse(
				(await send({
					body: { at: "2026-10-27T10:00:00.123456Z", nested: { n: 1 } },
				})) as string,
			);

			expect(sent.at).toBe("2026-10-27T10:00:00.123456Z");
			expect(sent.nested).toEqual({ n: 1 });
			expectSignedQuery(sent.oauth_query);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("appends oauth_query to a request without a body", async () => {
			stubSignedPage();

			const sent = JSON.parse((await send({})) as string);

			expect(Object.keys(sent)).toEqual(["oauth_query"]);
			expectSignedQuery(sent.oauth_query);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("keeps a form body form encoded and its repeated keys", async () => {
			stubSignedPage();

			const sent = new URLSearchParams(
				(await send({
					body: "tag=a&tag=b&name=Ada%20Lovelace",
					headers: { "content-type": "application/x-www-form-urlencoded" },
				})) as string,
			);

			expect(sent.getAll("tag")).toEqual(["a", "b"]);
			expect(sent.get("name")).toBe("Ada Lovelace");
			expect(sent.getAll("oauth_query")).toHaveLength(1);
			expectSignedQuery(sent.get("oauth_query"));
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it.each([
			"application/x-www-form-urlencoded;charset=UTF-8",
			"application/x-www-form-urlencoded; charset=utf-8",
			"Application/X-WWW-Form-Urlencoded",
		])("treats %s as a form body", async (contentType) => {
			stubSignedPage();

			const sent = new URLSearchParams(
				(await send({
					body: "tag=a&tag=b",
					headers: { "content-type": contentType },
				})) as string,
			);

			expect(sent.getAll("tag")).toEqual(["a", "b"]);
			expectSignedQuery(sent.get("oauth_query"));
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("keeps an oauth_query the caller already sent", async () => {
			stubSignedPage();

			expect(await send({ body: { oauth_query: "custom=1" } })).toBe(
				JSON.stringify({ oauth_query: "custom=1" }),
			);
			expect(
				await send({
					body: "oauth_query=custom%3D1",
					headers: { "content-type": "application/x-www-form-urlencoded" },
				}),
			).toBe("oauth_query=custom%3D1");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it.each([
			["an array", [1, { a: 2 }], '[1,{"a":2}]'],
			["a number", 5, "5"],
			["a string", '"text"', '"text"'],
		])("sends %s as a JSON body unchanged", async (_name, body, expected) => {
			stubSignedPage();

			expect(await send({ body })).toBe(expected);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12072
		 */
		it("hands a FormData body to fetch untouched", async () => {
			stubSignedPage();
			const body = new FormData();
			body.append("file", new Blob(["data"]), "data.txt");
			body.append("name", "Ada");

			const sent = await send({ body });

			expect(sent).toBe(body);
			expect([...body.keys()]).toEqual(["file", "name"]);
		});
	});
});
