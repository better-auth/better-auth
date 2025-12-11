import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { OAuthConsent, OAuthOptions, Scope } from "../types";
import { getClient } from "../utils";

async function getConsent(
	ctx: GenericEndpointContext & { query: { id: string } },
	opts: OAuthOptions<Scope[]>,
	id: string,
) {
	return await ctx.context.adapter.findOne<OAuthConsent<Scope[]>>({
		model: "oauthConsent",
		where: [
			{
				field: "id",
				value: id,
			},
		],
	});
}

export async function getConsentEndpoint(
	ctx: GenericEndpointContext & { query: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");

	const { id } = ctx.query;
	if (!id) {
		throw new APIError("NOT_FOUND", {
			error_description: "missing id parameter",
			error: "not_found",
		});
	}
	const consent = await getConsent(ctx, opts, id);

	if (!consent) {
		throw new APIError("NOT_FOUND", {
			error_description: "no consent",
			error: "not_found",
		});
	}
	if (consent.userId !== session.user.id) {
		throw new APIError("UNAUTHORIZED");
	}
	return consent;
}

export async function getConsentsEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");

	return await ctx.context.adapter.findMany<OAuthConsent<Scope[]>>({
		model: "oauthConsent",
		where: [
			{
				field: "userId",
				value: session.user.id,
			},
		],
	});
}

export async function deleteConsentEndpoint(
	ctx: GenericEndpointContext & { body: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");

	const { id } = ctx.body;
	if (!id) {
		throw new APIError("NOT_FOUND", {
			error_description: "missing id parameter",
			error: "not_found",
		});
	}

	const consent = await getConsent(ctx, opts, id);
	if (!consent) {
		throw new APIError("NOT_FOUND", {
			error_description: "no consent",
			error: "not_found",
		});
	}
	if (consent.userId !== session.user.id) throw new APIError("UNAUTHORIZED");

	await ctx.context.adapter.delete({
		model: "oauthConsent",
		where: [
			{
				field: "id",
				value: id,
			},
		],
	});
}

export async function updateConsentEndpoint(
	ctx: GenericEndpointContext & { body: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");

	const { id } = ctx.body;
	if (!id) {
		throw new APIError("NOT_FOUND", {
			error_description: "missing id parameter",
			error: "not_found",
		});
	}
	const consent = await getConsent(ctx, opts, id);
	if (!consent) {
		throw new APIError("NOT_FOUND", {
			error_description: "no consent",
			error: "not_found",
		});
	}

	const client = await getClient(ctx, opts, consent.clientId);
	if (!consent) {
		throw new APIError("NOT_FOUND", {
			error_description: "no consent",
			error: "not_found",
		});
	}
	if (consent.userId !== session.user.id) {
		throw new APIError("UNAUTHORIZED");
	}

	const allowedScopes = client?.scopes ?? opts.scopes ?? [];

	// Check if scopes are granted to that client
	const updates = ctx.body.update as Partial<OAuthConsent>;
	const scopes = updates.scopes;
	if (scopes && !scopes.every((val) => allowedScopes?.includes(val))) {
		throw new APIError("BAD_REQUEST", {
			error_description: `unable to provide scopes to ${client?.referenceId ?? client?.userId}`,
			error: "invalid_request",
		});
	}

	const iat = Math.floor(Date.now() / 1000);
	return await ctx.context.adapter.update<OAuthConsent<Scope[]>>({
		model: "oauthConsent",
		where: [
			{
				field: "id",
				value: id,
			},
		],
		update: {
			...updates,
			updatedAt: new Date(iat * 1000),
		},
	});
}
