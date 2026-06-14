import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { describe, expect, it, vi } from "vitest";
import { resolveAccessTokenClaims } from "./claims";
import type { OAuthOptions, SchemaClient, Scope } from "./types";

function optsWith(
	customAccessTokenClaims?: OAuthOptions<Scope[]>["customAccessTokenClaims"],
): OAuthOptions<Scope[]> {
	return { customAccessTokenClaims } as unknown as OAuthOptions<Scope[]>;
}

// These cases exercise the merge/strip/precedence logic with no extensions
// configured, so `ctx` and `client` are never dereferenced; typed stubs satisfy
// the resolver's input contract without a live request.
const baseInput = {
	ctx: {} as unknown as GenericEndpointContext,
	client: {} as unknown as SchemaClient<Scope[]>,
	user: undefined,
	scopes: ["openid"],
	resources: undefined,
	referenceId: undefined,
	metadata: undefined,
	grantType: undefined,
	perRequestClaims: undefined,
};

describe("resolveAccessTokenClaims", () => {
	it("returns an empty bag when no source contributes claims", async () => {
		const claims = await resolveAccessTokenClaims({
			opts: optsWith(),
			...baseInput,
			resourcePolicyClaims: {},
		});
		expect(claims).toEqual({});
	});

	// Precedence is the load-bearing invariant: the JWT mint and the opaque
	// introspection re-derive both call this, so the order must be fixed.
	// Lowest to highest: plugin customAccessTokenClaims < per-resource customClaims.
	it("merges plugin and resource claims, resource winning a collision", async () => {
		const claims = await resolveAccessTokenClaims({
			opts: optsWith(() => ({ tier: "free", region: "eu" })),
			...baseInput,
			resourcePolicyClaims: { tier: "enterprise", dept: "ops" },
		});
		expect(claims).toEqual({ tier: "enterprise", region: "eu", dept: "ops" });
	});

	it("strips reserved RFC 9068 names from every source", async () => {
		const claims = await resolveAccessTokenClaims({
			opts: optsWith(() => ({ sub: "evil", role: "admin" })),
			...baseInput,
			resourcePolicyClaims: { iss: "evil", scope: "evil", dept: "ops" },
		});
		expect(claims).toEqual({ role: "admin", dept: "ops" });
		for (const reserved of ["sub", "iss", "scope"]) {
			expect(claims).not.toHaveProperty(reserved);
		}
	});

	it("warns, naming the reserved claim names it stripped", async () => {
		const warnSpy = vi
			.spyOn(logger, "warn")
			.mockImplementation(() => undefined);
		try {
			await resolveAccessTokenClaims({
				opts: optsWith(() => ({ jti: "evil", role: "admin" })),
				...baseInput,
				resourcePolicyClaims: { iss: "evil" },
			});
			expect(warnSpy).toHaveBeenCalledOnce();
			const [message] = warnSpy.mock.calls[0] ?? [];
			expect(String(message)).toMatch(/stripped reserved RFC 9068 claim/i);
			expect(String(message)).toMatch(/jti/);
			expect(String(message)).toMatch(/iss/);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("hands derivable token context to customAccessTokenClaims", async () => {
		let received: Record<string, unknown> | undefined;
		await resolveAccessTokenClaims({
			...baseInput,
			opts: optsWith((info) => {
				received = info as Record<string, unknown>;
				return {};
			}),
			scopes: ["openid", "email"],
			resources: ["https://api.example.com"],
			referenceId: "ref-1",
			metadata: { plan: "pro" },
			resourcePolicyClaims: {},
		});
		expect(received).toMatchObject({
			scopes: ["openid", "email"],
			resources: ["https://api.example.com"],
			referenceId: "ref-1",
			metadata: { plan: "pro" },
		});
	});
});
