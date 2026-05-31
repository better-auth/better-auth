import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { JWS_ALGORITHMS } from "../audiences";
import type { OAuthOptions, Scope } from "../types";
import {
	createAudienceEndpoint,
	deleteAudienceEndpoint,
	getAudienceByIdentifierEndpoint,
	linkClientAudienceEndpoint,
	listAudiencesEndpoint,
	unlinkClientAudienceEndpoint,
	updateAudienceEndpoint,
} from "./endpoints";

/**
 * Shared body schema for create/update — every field is optional except
 * `identifier` on create (validated in the handler). Update accepts a
 * subset; the handler only writes fields that are explicitly present.
 */
const audienceBodySchema = z.object({
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

export const adminCreateAudience = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences",
		{
			method: "POST",
			body: audienceBodySchema.required({ identifier: true }),
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) => createAudienceEndpoint(ctx, opts),
	);

export const adminListAudiences = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences",
		{
			method: "GET",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) => listAudiencesEndpoint(ctx, opts),
	);

export const adminGetAudience = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences/:identifier",
		{
			method: "GET",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			getAudienceByIdentifierEndpoint(
				ctx as Parameters<typeof getAudienceByIdentifierEndpoint>[0],
				opts,
			),
	);

export const adminUpdateAudience = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences/:identifier",
		{
			method: "PATCH",
			body: audienceBodySchema,
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			updateAudienceEndpoint(
				ctx as Parameters<typeof updateAudienceEndpoint>[0],
				opts,
			),
	);

export const adminDeleteAudience = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences/:identifier",
		{
			method: "DELETE",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			deleteAudienceEndpoint(
				ctx as Parameters<typeof deleteAudienceEndpoint>[0],
				opts,
			),
	);

export const adminLinkClientAudience = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences/:identifier/clients/:client_id",
		{
			method: "POST",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			linkClientAudienceEndpoint(
				ctx as Parameters<typeof linkClientAudienceEndpoint>[0],
				opts,
			),
	);

export const adminUnlinkClientAudience = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/admin/oauth2/audiences/:identifier/clients/:client_id",
		{
			method: "DELETE",
			metadata: { SERVER_ONLY: true },
		},
		async (ctx) =>
			unlinkClientAudienceEndpoint(
				ctx as Parameters<typeof unlinkClientAudienceEndpoint>[0],
				opts,
			),
	);
