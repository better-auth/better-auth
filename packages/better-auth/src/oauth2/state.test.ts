import type { GenericEndpointContext } from "@better-auth/core";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * @see https://github.com/better-auth/better-auth/issues/9215
 *
 * Previously, all non-state_security_mismatch errors from parseGenericState
 * were redirected to ?error=please_restart_the_process, which:
 * 1. Lost diagnostic specificity (state_invalid vs state_mismatch have different causes)
 * 2. Led to a 404 docs page (no please_restart_the_process.mdx existed)
 *
 * Now StateError codes are forwarded directly (with state_security_mismatch
 * mapped to state_mismatch), and unexpected errors map to internal_server_error.
 */

let errorToThrow: Error | null = null;

vi.mock("../state", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import("../state");
	return {
		...actual,
		parseGenericState: vi.fn().mockImplementation(() => {
			if (errorToThrow) {
				throw errorToThrow;
			}
			return {};
		}),
		generateGenericState: vi.fn(),
	};
});

vi.mock("../api/state/oauth", () => ({
	setOAuthState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../crypto", () => ({
	generateRandomString: vi.fn().mockReturnValue("mock-random-string"),
}));

function createMockContext(overrides?: {
	baseURL?: string;
	errorURL?: string;
}) {
	const baseURL = overrides?.baseURL ?? "http://localhost:3000/api/auth";
	const redirectCalls: string[] = [];
	const ctx = {
		query: {},
		body: {},
		context: {
			options: {
				onAPIError: overrides?.errorURL
					? { errorURL: overrides.errorURL }
					: undefined,
				baseURL,
			},
			logger: { error: vi.fn() },
			secretConfig: "test-secret",
		},
		redirect(url: string) {
			redirectCalls.push(url);
			throw new Error(`REDIRECT:${url}`);
		},
	};
	return { ctx, redirectCalls };
}

afterEach(() => {
	errorToThrow = null;
});

describe("parseState error mapping", () => {
	it("should redirect to ?error=state_not_found when StateError code is state_not_found", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("State not found in OAuth callback", {
			code: "state_not_found",
		});

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toContain("state_not_found");
		expect(redirectCalls[0]).not.toContain("please_restart_the_process");
	});

	it("should redirect to ?error=state_mismatch when StateError code is state_security_mismatch", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError(
			"State mismatch: State not persisted correctly",
			{ code: "state_security_mismatch" },
		);

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toContain("state_mismatch");
		expect(redirectCalls[0]).not.toContain("please_restart_the_process");
	});

	it("should redirect to ?error=state_invalid when StateError code is state_invalid", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("State invalid: Failed to decrypt state", {
			code: "state_invalid",
		});

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toContain("state_invalid");
		expect(redirectCalls[0]).not.toContain("please_restart_the_process");
	});

	it("should redirect to ?error=state_mismatch when StateError code is state_mismatch", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("State mismatch: verification not found", {
			code: "state_mismatch",
		});

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toContain("state_mismatch");
		expect(redirectCalls[0]).not.toContain("please_restart_the_process");
	});

	it("should redirect to ?error=internal_server_error when a non-StateError is thrown", async () => {
		errorToThrow = new Error("Unexpected error");

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toContain("internal_server_error");
		expect(redirectCalls[0]).not.toContain("please_restart_the_process");
	});

	it("should use custom errorURL when onAPIError.errorURL is set", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("State mismatch", {
			code: "state_mismatch",
		});

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext({
			errorURL: "https://example.com/custom-error",
		});

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toBe(
			"https://example.com/custom-error?error=state_mismatch",
		);
	});

	it("should use & separator when errorURL already has query params", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("State invalid", {
			code: "state_invalid",
		});

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext({
			errorURL: "https://example.com/error?foo=bar",
		});

		try {
			await parseState(ctx as unknown as GenericEndpointContext);
		} catch {}

		expect(redirectCalls[0]).toBe(
			"https://example.com/error?foo=bar&error=state_invalid",
		);
	});
});
