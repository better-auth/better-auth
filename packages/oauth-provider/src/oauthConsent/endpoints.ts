import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { revokeConsentTokens } from "../token";
import type { OAuthConsent, OAuthOptions, Scope } from "../types";
import {
	findConsent,
	findConsentRows,
	getClient,
	updateConsent,
} from "../utils";

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
	return (
		(await findConsent(
			ctx,
			consent.clientId,
			consent.userId,
			consent.referenceId || undefined,
		)) ?? consent
	);
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

	// Revoke first: a failed revocation leaves the consent in place, so the
	// user can retry instead of keeping tokens with no consent to delete.
	await revokeConsentTokens(ctx, opts, {
		clientId: consent.clientId,
		userId: consent.userId,
		referenceId: consent.referenceId,
	});
	// Another row stored for the same reference would keep the consent.
	for (const row of await findConsentRows(ctx, consent)) {
		await ctx.context.adapter.delete({
			model: "oauthConsent",
			where: [{ field: "id", value: row.id }],
		});
	}
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
	if (consent.userId !== session.user.id) {
		throw new APIError("UNAUTHORIZED");
	}

	const client = await getClient(ctx, opts, consent.clientId);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
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

	// Narrowing leaves issued tokens valid; deleting the consent revokes them.
	return await updateConsent(ctx, consent, () => (scopes ? { scopes } : {}));
}
