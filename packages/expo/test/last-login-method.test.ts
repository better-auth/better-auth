import { createAuthClient } from "better-auth/client";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import type { LastLoginMethodClientConfig } from "../src/plugins/last-login-method";
import { lastLoginMethodClient } from "../src/plugins/last-login-method";

const createMockStorage = () => {
	const store = new Map<string, string>();

	return {
		getItem: (key: string) => {
			return store.get(key) ?? null;
		},
		setItem: (key: string, value: string) => {
			return store.set(key, value);
		},
		deleteItemAsync: async (key: string) => {
			store.delete(key);
		},
	} satisfies LastLoginMethodClientConfig["storage"];
};

describe("last-login-method expo", async () => {
	const { customFetchImpl, testUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
	});

	it("should resolve email login method and allow to clear storage", async () => {
		const storage = createMockStorage();

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [
				lastLoginMethodClient({
					storage,
				}),
			],
			fetchOptions: {
				customFetchImpl,
			},
		});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		expect(client.getLastUsedLoginMethod()).toStrictEqual("email");

		client.clearLastUsedLoginMethod();

		expect(client.getLastUsedLoginMethod()).toBeNull();
	});

	it("should allow custom provider tracking", async () => {
		const storage = createMockStorage();

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [
				lastLoginMethodClient({
					storage,
					customResolveMethod: (url) => {
						return "custom";
					},
				}),
			],
			fetchOptions: {
				customFetchImpl,
			},
		});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		expect(client.getLastUsedLoginMethod()).toStrictEqual("custom");
	});

	it("should allow to define a custom storage prefix", async () => {
		const storage = createMockStorage();

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [
				lastLoginMethodClient({
					storage,
					storagePrefix: "myapp",
				}),
			],
			fetchOptions: {
				customFetchImpl,
			},
		});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		expect(storage.getItem("myapp_last_login_method")).toStrictEqual("email");
	});
});
