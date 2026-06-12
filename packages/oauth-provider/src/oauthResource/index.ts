import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { JWS_ALGORITHMS } from "../resources";
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

/**
 * Shared body schema for create/update — every field is optional except
 * `identifier` on create (validated in the handler). Update accepts a
 * subset; the handler only writes fields that are explicitly present.
 */
const resourceBodySchema = z.object({
	identifier: z.string().min(1).optional(),
	name: z.string().optional(),
	accessTokenTtl: z.number().int().positive().nullable().optional(),
	refreshTokenTtl: z.number().int().positive().nullable().optional(),
	signingAlgorithm: z.enum(JWS_ALGORITHMS).nullable().optional(),
	signingKeyId: z.string().nullable().optional(),
	allowedScopes: z.array(z.string()).nullable().optional(),
	customClaims: z.record(z.string(), z.unknown()).nullable().optional(),
	disabled: z.boolean().optional(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const adminCreateOAuthResource = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/resources",
		{
			method: "POST",
			body: resourceBodySchema.required({ identifier: true }),
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
			body: resourceBodySchema,
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
