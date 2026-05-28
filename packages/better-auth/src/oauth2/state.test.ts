import type { GenericEndpointContext } from "@better-auth/core";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * @see https://github.com/better-auth/better-auth/issues/9215
 *
 * `parseState` forwards the specific `StateError` code raised while reading the
 * OAuth state, instead of collapsing every failure into a single opaque code.
 * `state_security_mismatch` is reported to callers as `state_mismatch`, and any
 * non-`StateError` failure maps to `internal_server_error`.
 */

let errorToThrow: Error | null = null;

vi.mock("../state", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../state")>();
	return {
		...actual,
		parseGenericState: vi.fn(() => {
			if (errorToThrow) throw errorToThrow;
			return {};
		}),
	};
});

vi.mock("../api/state/oauth", () => ({
	setOAuthState: vi.fn().mockResolvedValue(undefined),
}));

function createMockContext(errorURL?: string) {
	const redirectCalls: string[] = [];
	const ctx = {
		query: {},
		body: {},
		context: {
			baseURL: "http://localhost:3000/api/auth",
			options: {
				onAPIError: errorURL ? { errorURL } : undefined,
			},
			logger: { error: vi.fn() },
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
	it.each([
		["state_not_found", "state_not_found"],
		["state_invalid", "state_invalid"],
		["state_mismatch", "state_mismatch"],
		["state_security_mismatch", "state_mismatch"],
	])("maps StateError %s to error=%s", async (code, expected) => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError(code, { code: code as any });

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();
		await parseState(ctx as unknown as GenericEndpointContext).catch(() => {});

		expect(redirectCalls[0]).toContain(`error=${expected}`);
		expect(redirectCalls[0]).not.toContain("please_restart_the_process");
	});

	it("maps an unexpected (non-StateError) failure to internal_server_error", async () => {
		errorToThrow = new Error("boom");

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();
		await parseState(ctx as unknown as GenericEndpointContext).catch(() => {});

		expect(redirectCalls[0]).toContain("error=internal_server_error");
	});

	it("appends error with & when the error URL already has a query string", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("state_invalid", { code: "state_invalid" });

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext(
			"https://example.com/error?foo=bar",
		);
		await parseState(ctx as unknown as GenericEndpointContext).catch(() => {});

		expect(redirectCalls[0]).toBe(
			"https://example.com/error?foo=bar&error=state_invalid",
		);
	});

	/**
	 * The per-flow `errorCallbackURL` recovered from the state takes precedence
	 * over the default error page, and the error parameter is appended with the
	 * correct separator when that URL already carries a query string.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/5467
	 */
	it("prefers the recovered per-flow errorURL and appends with & when it has a query", async () => {
		const { StateError } = await import("../state");
		errorToThrow = new StateError("State mismatch", {
			code: "state_security_mismatch",
			errorURL: "/oauth-error?source=expo",
		});

		const { parseState } = await import("./state");
		const { ctx, redirectCalls } = createMockContext();
		await parseState(ctx as unknown as GenericEndpointContext).catch(() => {});

		expect(redirectCalls[0]).toBe(
			"/oauth-error?source=expo&error=state_mismatch",
		);
	});
});
