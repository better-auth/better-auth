import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { EMPTY_ALLOWED_SCOPES_MESSAGE, JWS_ALGORITHMS } from "../resources";
import type { OAuthOptions, Scope } from "../types";
import {
	createResourceEndpoint,
	deleteResourceEndpoint,
	getResourceByIdentifierEndpoint,
	linkClientResourceEndpoint,
	listResourcesEndpoint,
	unlinkClientResourceEndpoint,
	updateResourceEndpoint,
} from "./endpoints";

const baseResourceBodySchema = z.object({
	identifier: z.string().min(1).optional(),
	name: z.string().optional(),
	accessTokenTtl: z.number().int().positive().nullable().optional(),
	refreshTokenTtl: z.number().int().positive().nullable().optional(),
	signingAlgorithm: z.enum(JWS_ALGORITHMS).nullable().optional(),
	signingKeyId: z.string().nullable().optional(),
	customClaims: z.record(z.string(), z.unknown()).nullable().optional(),
	dpopBoundAccessTokensRequired: z.boolean().optional(),
	disabled: z.boolean().optional(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * Shared `allowedScopes` field for the admin create and update schemas.
 * Mirrors the seed-path `[]` rejection in `oauthProvider()` (`oauth.ts`):
 * an explicit empty array is rejected at the schema boundary (400) with
 * guidance to pass `null` (or omit the field) for "no restriction", or set
 * `disabled: true` to stop issuing tokens. `null`/omitted still mean
 * unrestricted and are stored as `[]` (see `buildResourceRow`), which keeps
 * reading as unrestricted via `normalizeAllowedScopes` (legacy/migration
 * shim for pre-existing rows).
 */
const allowedScopesField = z
	.array(z.string())
	.min(1, EMPTY_ALLOWED_SCOPES_MESSAGE)
	.nullable()
	.optional();

const createResourceBodySchema = baseResourceBodySchema
	.extend({ allowedScopes: allowedScopesField })
	.required({ identifier: true });

const updateResourceBodySchema = baseResourceBodySchema.extend({
	allowedScopes: allowedScopesField,
});

export const adminCreateOAuthResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources",
		{
			method: "POST",
			body: createResourceBodySchema,
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) => createResourceEndpoint(ctx, opts),
	);

export const adminListOAuthResources = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources",
		{
			method: "GET",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) => listResourcesEndpoint(ctx, opts),
	);

export const adminGetOAuthResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources/:identifier",
		{
			method: "GET",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			getResourceByIdentifierEndpoint(
				ctx as Parameters<typeof getResourceByIdentifierEndpoint>[0],
				opts,
			),
	);

export const adminUpdateOAuthResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources/:identifier",
		{
			method: "PATCH",
			body: updateResourceBodySchema,
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			updateResourceEndpoint(
				ctx as Parameters<typeof updateResourceEndpoint>[0],
				opts,
			),
	);

export const adminDeleteOAuthResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources/:identifier",
		{
			method: "DELETE",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			deleteResourceEndpoint(
				ctx as Parameters<typeof deleteResourceEndpoint>[0],
				opts,
			),
	);

export const adminLinkClientResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources/:identifier/clients/:client_id",
		{
			method: "POST",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			linkClientResourceEndpoint(
				ctx as Parameters<typeof linkClientResourceEndpoint>[0],
				opts,
			),
	);

export const adminUnlinkClientResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources/:identifier/clients/:client_id",
		{
			method: "DELETE",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			unlinkClientResourceEndpoint(
				ctx as Parameters<typeof unlinkClientResourceEndpoint>[0],
				opts,
			),
	);
