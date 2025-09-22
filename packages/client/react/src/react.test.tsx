// @vitest-environment happy-dom
import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthClient } from "./index";
import { testClientPlugin } from "./test/test-plugin";
import type {
	Session,
	SessionQueryParams,
	BetterFetchError,
} from "@better-auth/client-core";

describe("react client", () => {
	it("should export the correct types", () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
		});

		// Test useSession hook types
		expectTypeOf(client.useSession).toBeFunction();
		// Note: Cannot call hooks outside of React component context
		// Just test that they exist and are functions

		// Test custom hooks from plugins
		expectTypeOf(client.useTest).toBeFunction();
		expectTypeOf(client.useComputedAtom).toBeFunction();
		expectTypeOf(client.useQueryAtom).toBeFunction();
	});

	it("should create hooks for plugin atoms", () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
		});

		expect(client.useTest).toBeDefined();
		expect(client.useComputedAtom).toBeDefined();
		expect(client.useQueryAtom).toBeDefined();
		expect(client.useSession).toBeDefined();
	});

	it("should have correct client API methods", () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
		});

		expect(client.test).toBeDefined();
		expect(client.setTestAtom).toBeDefined();
		expect(client.test.signOut).toBeDefined();
		expect(client.$fetch).toBeDefined();
		expect(client.$store).toBeDefined();
	});
});
