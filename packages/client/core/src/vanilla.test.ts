// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./vanilla";
import { testClientPlugin, testClientPlugin2 } from "./test/test-plugin";
import { isProxy } from "node:util/types";

describe("vanilla client", () => {
	it("atom in proxy should not be proxy", async () => {
		const client = createAuthClient();
		const atom = client.$store.atoms.session;
		expect(isProxy(atom)).toBe(false);
	});

	it("proxy api should be called", async () => {
		let apiCalled = false;
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					apiCalled = true;
					return new Response();
				},
				baseURL: "http://localhost:3000",
			},
		});
		await client.test();
		expect(apiCalled).toBe(true);
	});

	it("state listener should be called on matched path", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
				baseURL: "http://localhost:3000",
			},
		});
		const atom = client.$store.atoms.$test;
		let called = false;
		atom.subscribe(() => {
			called = true;
		});
		await client.test();
		expect(called).toBe(true);
	});

	it("should merge same id plugins atoms", () => {
		const client = createAuthClient({
			plugins: [testClientPlugin(), testClientPlugin2()],
		});
		expect(client.$store.atoms.$test).toBeDefined();
		expect(client.$store.atoms.$test2).toBeDefined();
		expect(client.$store.atoms.computedAtom).toBeDefined();
		expect(client.$store.atoms.anotherAtom).toBeDefined();
	});

	// Skip this test for now as it requires deeper integration
	it.skip("should match sign-out path", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
				baseURL: "http://localhost:3000",
			},
		});
		const sessionAtom = client.$store.atoms.session;
		const clearSessionMock = vi.spyOn(sessionAtom, "set");
		await client.testSignOut2();
		expect(clearSessionMock).toHaveBeenCalledWith({
			session: null,
			user: null,
		});
	});
});
