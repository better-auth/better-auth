import { beforeEach, describe, expect, it, vi } from "vitest";

const headers = new Headers({ cookie: "session=abc" });
const refresh = vi.fn(async () => {});

vi.mock("$app/server", () => ({
	getRequestEvent: () => ({ request: { headers } }),
	query: (fn: () => Promise<unknown>) => {
		return () => Object.assign(fn(), { refresh });
	},
	form: (_schema: unknown, fn: (data: any) => Promise<unknown>) => fn,
	command: (fn: () => Promise<unknown>) => fn,
}));

import { createRemoteAuthClient } from "./remote";

function auth() {
	return {
		api: {
			signInEmail: vi.fn(async () => ({ token: "in" })),
			signUpEmail: vi.fn(async () => ({ token: "up" })),
			signOut: vi.fn(async () => ({ success: true })),
			getSession: vi.fn(async () => ({ session: { id: "s" } })),
		},
	};
}

describe("createRemoteAuthClient", () => {
	beforeEach(() => {
		refresh.mockClear();
	});

	it("signs in with the request headers and refreshes the session", async () => {
		const instance = auth();
		const client = createRemoteAuthClient(instance);
		await client.signIn.email({
			email: "a@b.co",
			password: "secret",
			rememberMe: "on",
		});
		expect(instance.api.signInEmail).toHaveBeenCalledWith({
			body: { email: "a@b.co", password: "secret", rememberMe: true },
			headers,
		});
		expect(refresh).toHaveBeenCalledOnce();
	});

	it("signs up with name, email, and password", async () => {
		const instance = auth();
		const client = createRemoteAuthClient(instance);
		await client.signUp.email({
			name: "Ada",
			email: "a@b.co",
			password: "secret",
		});
		expect(instance.api.signUpEmail).toHaveBeenCalledWith({
			body: { name: "Ada", email: "a@b.co", password: "secret" },
			headers,
		});
	});

	it("signs out and reads the session from the request", async () => {
		const instance = auth();
		const client = createRemoteAuthClient(instance);
		await client.signOut();
		expect(instance.api.signOut).toHaveBeenCalledWith({ headers });
		await client.useSession();
		expect(instance.api.getSession).toHaveBeenCalledWith({ headers });
	});
});
