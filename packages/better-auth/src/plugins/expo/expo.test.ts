import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { expo } from ".";
import { expoClient } from "./client";

vi.mock("expo-web-browser", async () => {
	return {
		openAuthSessionAsync: vi.fn(async (...args) => {
			fn(...args);
			return {
				type: "success",
				url: "better-auth://?cookie=better-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYxMzQwZj",
			};
		}),
	};
});

const fn = vi.fn();

describe("expo", async () => {
	const storage = new Map<string, string>();
	const { client, testUser } = await getTestInstance(
		{
			plugins: [expo()],
			trustedOrigins: ["better-auth://"],
		},
		{
			clientOptions: {
				plugins: [
					expoClient({
						scheme: "better-auth",
						storage: {
							getItemAsync(key) {
								return Promise.resolve(storage.get(key) || null);
							},
							setItemAsync(key, value) {
								storage.set(key, value);
							},
							deleteItemAsync(key) {
								storage.delete(key);
							},
						},
					}),
				],
			},
		},
	);

	it("should store cookie with expires date", async () => {
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		const storedCookie = storage.get("better-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["better-auth.session_token"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
	});

	it("should send cookie and get session", async () => {
		const { data } = await client.getSession();
		expect(data).toMatchObject({
			session: expect.any(Object),
			user: expect.any(Object),
		});
	});

	it("should use the scheme to open the browser", async () => {
		const { data: res } = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
		});
		expect(res).toMatchObject({
			url: expect.stringContaining("accounts.google"),
		});
		expect(fn).toHaveBeenCalledWith(
			expect.stringContaining("accounts.google"),
			"better-auth:///dashboard",
		);
	});
});
