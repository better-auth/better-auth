import { describe, expect, it } from "vitest";
import { testClientPlugin } from "./test-plugin";
import { createAuthClient } from "./vanilla";

describe("url", () => {
	it("should not require base url", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			baseURL: "",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response(JSON.stringify({ hello: "world" }));
				},
			},
		});
		const response = await client.test();
		expect(response.data).toEqual({ hello: "world" });
	});

	it("should use base url and append `/api/auth` by default", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response(JSON.stringify({ url }));
				},
			},
		});
		const response = await client.test();
		expect(response.data).toEqual({
			url: "http://localhost:3000/api/auth/test",
		});
	});

	it("should use base url and use the provider path if provided", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response(JSON.stringify({ url }));
				},
			},
		});
		const response = await client.test();
		expect(response.data).toEqual({
			url: "http://localhost:3000/auth/test",
		});
	});

	it("should use be able to detect `/` in the base url", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			basePath: "/",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response(JSON.stringify({ url }));
				},
			},
		});
		const response = await client.test();
		expect(response.data).toEqual({
			url: "http://localhost:3000/test",
		});
	});
});
