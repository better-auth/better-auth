import { describe, expect, it } from "vitest";
import { betterAuth, toContext } from "../src";
import { memoryAdapter } from "../src/adapters/memory";
import { createFetch } from "@better-fetch/fetch";
import { getH3Server } from "./utils/server";
import type { BetterAuthOptions } from "../src/options";
import { InvalidRequest, InvalidURL } from "../src/errors";

describe("index", async () => {
	const { handler } = betterAuth({
		providers: [],
		adapter: memoryAdapter({}),
		user: {
			fields: {
				email: { type: "string", required: true },
				emailVerified: { type: "boolean", required: true },
				image: { type: "string", required: false },
				name: { type: "string", required: true },
			},
		},
	});
	getH3Server(handler, 4000);

	const url = "http://localhost:4000/api/auth";
	const client = createFetch({
		baseURL: url,
	});

	it("should return 403 with status text csrf token is invalid", async () => {
		const { data, error } = await client("/signin", {
			method: "POST",
			body: {
				csrfToken: "Invalid",
			},
		});
		expect(error).toMatchSnapshot();
	});

	it("should return 404 with status text not found", async () => {
		const { data, error } = await client("/not-found", {
			method: "POST",
			body: {},
		});
		expect(error).toMatchSnapshot();
	});

	it("should return 200 and return csrf token", async () => {
		const { data } = await client<{ csrfToken: string }>("/csrf");
		expect(data?.csrfToken).toBeDefined();
	});
});

describe("to context", async () => {
	const options: BetterAuthOptions = {
		providers: [],
		adapter: memoryAdapter({}),
		pages: {
			signIn: "/",
			signUp: "/",
		},
		user: {
			fields: {
				email: { type: "string", required: true },
				emailVerified: { type: "boolean", required: true },
				image: { type: "string", required: false },
				name: { type: "string", required: true },
			},
		},
	};
	it("should return a valid context", async () => {
		const context = await toContext(
			options,
			new Request("https://better-auth.com/api/auth/signin", {
				method: "POST",
				body: JSON.stringify({
					provider: "github",
				}),
			}),
		);
		expect(context).toMatchSnapshot();
	});

	it("should ignore the request url for the baseURL passed in options", async () => {
		options.baseURL = "https://test-1.com";
		const context = await toContext(
			options,
			new Request("https://better-auth.com/api/auth/signin", {
				method: "POST",
				body: JSON.stringify({
					provider: "github",
				}),
			}),
		);
		expect(context).toMatchSnapshot();
	});

	it("should ignore the request url for the baseURL passed in process.env.BETTER_AUTH_URL", async () => {
		options.baseURL = undefined;
		process.env.BETTER_AUTH_URL = "https://test-2.com";
		const context = await toContext(
			options,
			new Request("https://better-auth.com/api/auth/signin", {
				method: "POST",
				body: JSON.stringify({
					provider: "github",
				}),
			}),
		);
		expect(context).toMatchSnapshot();
	});

	it("should make body null if it's not a POST request", async () => {
		const context = await toContext(
			options,
			new Request("https://better-auth.com/api/auth/signin", {
				method: "GET",
			}),
		);
		expect(context.request.body).toBe(null);
	});

	it("should throw an error if the body is not a valid JSON on post request.", async () => {
		const request = new Request("https://better-auth.com/api/auth/signin", {
			method: "POST",
			body: "invalid",
		});
		await expect(() => toContext(options, request)).rejects.toThrowError(
			InvalidRequest,
		);
	});
});
