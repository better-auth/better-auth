import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
	createOAuthEndpoint,
	isMissingValueIssue,
	mapIssuesToOAuthError,
} from "./oauth-endpoint";

/**
 * @see https://github.com/better-auth/better-auth/issues/9250
 */
describe("mapIssuesToOAuthError", () => {
	it("returns defaultError when issue list is empty", () => {
		expect(mapIssuesToOAuthError([])).toEqual({
			error: "invalid_request",
			error_description: "Invalid request.",
		});
	});

	it("honors custom defaultError when no mapping matches", () => {
		const issues =
			z.object({ foo: z.string() }).safeParse({}).error?.issues ?? [];
		expect(
			mapIssuesToOAuthError(issues, undefined, "invalid_client_metadata"),
		).toEqual({
			error: "invalid_client_metadata",
			error_description: "foo is required",
		});
	});

	it("applies string field mapping to both missing and invalid cases", () => {
		const schema = z.object({ redirect_uris: z.array(z.string()).min(1) });
		const missing = schema.safeParse({}).error?.issues ?? [];
		const invalid =
			schema.safeParse({ redirect_uris: "nope" }).error?.issues ?? [];

		expect(
			mapIssuesToOAuthError(missing, { redirect_uris: "invalid_redirect_uri" }),
		).toMatchObject({ error: "invalid_redirect_uri" });
		expect(
			mapIssuesToOAuthError(invalid, { redirect_uris: "invalid_redirect_uri" }),
		).toMatchObject({ error: "invalid_redirect_uri" });
	});

	it("distinguishes missing from invalid when mapping uses object form", () => {
		// Required enum fields must be wrapped in `z.string().pipe(z.enum([...]))`
		// so that missing surfaces as invalid_type and invalid surfaces as invalid_value.
		const schema = z.object({
			grant_type: z
				.string()
				.pipe(
					z.enum(["authorization_code", "client_credentials", "refresh_token"]),
				),
		});
		const mapping = {
			grant_type: {
				missing: "invalid_request" as const,
				invalid: "unsupported_grant_type" as const,
			},
		};

		const missing = schema.safeParse({}).error?.issues ?? [];
		expect(mapIssuesToOAuthError(missing, mapping)).toMatchObject({
			error: "invalid_request",
			error_description: "grant_type is required",
		});

		const invalid =
			schema.safeParse({ grant_type: "password" }).error?.issues ?? [];
		expect(mapIssuesToOAuthError(invalid, mapping)).toMatchObject({
			error: "unsupported_grant_type",
		});
	});

	it("falls back to the other object mapping half when only one is defined", () => {
		const schema = z.object({
			token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
		});
		const invalid =
			schema.safeParse({ token_type_hint: "id_token" }).error?.issues ?? [];
		expect(
			mapIssuesToOAuthError(invalid, {
				token_type_hint: { invalid: "unsupported_token_type" },
			}),
		).toMatchObject({ error: "unsupported_token_type" });
	});

	it("describes duplicated scalar fields as appearing more than once", () => {
		const schema = z.object({ resource: z.string() });
		const issues =
			schema.safeParse({ resource: ["one", "two"] }).error?.issues ?? [];
		expect(mapIssuesToOAuthError(issues)).toMatchObject({
			error: "invalid_request",
			error_description: "resource must not appear more than once",
		});
	});

	it("routes duplicated fields to defaultError even when mapping.invalid is set", () => {
		const schema = z.object({
			response_type: z
				.string()
				.pipe(z.enum(["code"]))
				.optional(),
		});
		const issues =
			schema.safeParse({ response_type: ["code", "token"] }).error?.issues ??
			[];
		expect(
			mapIssuesToOAuthError(issues, {
				response_type: { invalid: "unsupported_response_type" },
			}),
		).toMatchObject({
			error: "invalid_request",
			error_description: "response_type must not appear more than once",
		});
	});

	it("routes unsupported enum values through mapping.invalid", () => {
		const schema = z.object({
			response_type: z
				.string()
				.pipe(z.enum(["code"]))
				.optional(),
		});
		const issues =
			schema.safeParse({ response_type: "token" }).error?.issues ?? [];
		const result = mapIssuesToOAuthError(issues, {
			response_type: { invalid: "unsupported_response_type" },
		});
		expect(result.error).toBe("unsupported_response_type");
		expect(result.error_description).toMatch(/response_type/);
	});
});

/**
 * Pins the zod v4 message suffixes that `isMissingValueIssue` and
 * `describeIssue` rely on. A rephrase in a zod release would fail these
 * assertions before it could silently reclassify missing or duplicated
 * fields in production.
 * @see https://github.com/better-auth/better-auth/issues/9250
 */
describe("zod v4 issue shape contract", () => {
	it("reports missing required string as invalid_type + 'received undefined'", () => {
		const schema = z.object({ grant_type: z.string() });
		const issue = schema.safeParse({}).error?.issues[0];
		expect(issue).toBeDefined();
		expect(issue!.code).toBe("invalid_type");
		expect(issue!.message.endsWith("received undefined")).toBe(true);
		expect(isMissingValueIssue(issue!)).toBe(true);
	});

	it("reports duplicated string field as invalid_type + 'received array'", () => {
		const schema = z.object({ resource: z.string() });
		const issue = schema.safeParse({ resource: ["a", "b"] }).error?.issues[0];
		expect(issue).toBeDefined();
		expect(issue!.code).toBe("invalid_type");
		expect(issue!.message.endsWith("received array")).toBe(true);
		expect(isMissingValueIssue(issue!)).toBe(false);
	});

	it("reports unsupported enum value as invalid_value", () => {
		const schema = z.object({
			grant_type: z.string().pipe(z.enum(["authorization_code"])),
		});
		const issue = schema.safeParse({ grant_type: "password" }).error?.issues[0];
		expect(issue).toBeDefined();
		expect(issue!.code).toBe("invalid_value");
		expect(isMissingValueIssue(issue!)).toBe(false);
	});
});

describe("createOAuthEndpoint factory guards", () => {
	it("throws when errorDelivery is 'redirect' but redirectOnError is absent", () => {
		expect(() =>
			createOAuthEndpoint(
				"/oauth2/authorize",
				{
					method: "GET",
					query: z.object({ client_id: z.string() }),
					errorDelivery: "redirect",
				},
				async () => ({}),
			),
		).toThrow(/requires redirectOnError/);
	});
});
