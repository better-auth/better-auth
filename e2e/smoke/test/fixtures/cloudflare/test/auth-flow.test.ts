import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [{ configPath: "./wrangler.json" }],
});

beforeAll(async () => {
	await server.listen();
});

beforeEach(async () => {
	const response = await server.fetch("http://localhost:8787/_test/migrate", {
		method: "POST",
	});
	expect(response.status).toBe(204);
});

afterEach(async ({ task }) => {
	if (task.result?.state === "fail") server.debug();
	await server.reset();
});

afterAll(async () => {
	await server.close();
});

describe("email and password authentication", () => {
	it("creates a user with email and password", async () => {
		const email = `${crypto.randomUUID()}@test.com`;
		const name = crypto.randomUUID().replaceAll("-", "").slice(6);
		const password = crypto.randomUUID();

		const response = await server.fetch(
			"http://localhost:8787/api/auth/sign-up/email",
			{
				method: "POST",
				body: JSON.stringify({ email, name, password }),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(response.status).toBe(200);
		const body: unknown = await response.json();
		expect(body).toMatchObject({ user: { email, name } });
	});

	it("sets a session cookie after sign-in", async () => {
		const email = `${crypto.randomUUID()}@test.com`;
		const password = crypto.randomUUID();

		const signUpResponse = await server.fetch(
			"http://localhost:8787/api/auth/sign-up/email",
			{
				method: "POST",
				body: JSON.stringify({
					email,
					name: crypto.randomUUID().replaceAll("-", "").slice(6),
					password,
				}),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(signUpResponse.status).toBe(200);
		await signUpResponse.text();

		const signInResponse = await server.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({ email, password }),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(signInResponse.status).toBe(200);
		expect(signInResponse.headers.get("set-cookie")).toContain(
			"better-auth.session",
		);
		await signInResponse.text();
	});

	it("reads a session from its cookie", async () => {
		const email = `${crypto.randomUUID()}@test.com`;
		const name = crypto.randomUUID().replaceAll("-", "").slice(6);
		const password = crypto.randomUUID();

		const signUpResponse = await server.fetch(
			"http://localhost:8787/api/auth/sign-up/email",
			{
				method: "POST",
				body: JSON.stringify({ email, name, password }),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(signUpResponse.status).toBe(200);
		await signUpResponse.text();

		const signInResponse = await server.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({ email, password }),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(signInResponse.status).toBe(200);
		await signInResponse.text();

		const token = signInResponse.headers.get("set-cookie")?.split(";")[0];
		expect(token).toBeDefined();

		const sessionResponse = await server.fetch(
			"http://localhost:8787/_test/session",
			{
				headers: { Cookie: token ?? "" },
			},
		);
		expect(sessionResponse.status).toBe(200);
		const body: unknown = await sessionResponse.json();
		expect(body).toMatchObject({ user: { email, name } });
	});

	it("rejects an invalid password without setting a session cookie", async () => {
		const email = `${crypto.randomUUID()}@test.com`;
		const password = crypto.randomUUID();

		const signUpResponse = await server.fetch(
			"http://localhost:8787/api/auth/sign-up/email",
			{
				method: "POST",
				body: JSON.stringify({
					email,
					name: crypto.randomUUID().replaceAll("-", "").slice(6),
					password,
				}),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(signUpResponse.status).toBe(200);
		await signUpResponse.text();

		const response = await server.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({
					email,
					password: `${password}-invalid`,
				}),
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4000",
				},
			},
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("set-cookie")).toBeNull();
		const body: unknown = await response.json();
		expect(body).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
	});

	it("returns no session without a session cookie", async () => {
		const response = await server.fetch("http://localhost:8787/_test/session");
		expect(response.status).toBe(200);
		expect(await response.json()).toBeNull();
	});
});
