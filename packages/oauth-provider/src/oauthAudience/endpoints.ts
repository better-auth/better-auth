import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { Session, User } from "better-auth/types";
import {
	assertIdentifierValid,
	buildClientAudienceLinkId,
	invalidateAudienceCache,
} from "../audiences";
import type {
	OAuthAudience,
	OAuthAudienceInput,
	OAuthOptions,
	Scope,
} from "../types";

/**
 * Action types passed to {@link OAuthOptions.audiencePrivileges}. Mirrors
 * the `clientPrivileges` action vocabulary so admins can reuse the same
 * RBAC patterns.
 */
type AudienceAction =
	| "create"
	| "read"
	| "update"
	| "delete"
	| "list"
	| "link"
	| "unlink";

/**
 * Gate every admin audience endpoint. Mirrors `assertClientPrivileges`:
 * a missing session → 401; a defined `audiencePrivileges` callback that
 * returns falsy → 401 with the original action context preserved.
 *
 * When `audiencePrivileges` is undefined, the gate degrades to "any
 * authenticated session can manage audiences" — same forgiving default
 * as `clientPrivileges`. Operators who care about RBAC must define the
 * callback.
 *
 * @internal
 */
async function assertAudiencePrivileges(
	ctx: GenericEndpointContext,
	session: { session: Session; user: User } | null,
	opts: OAuthOptions<Scope[]>,
	action: AudienceAction,
	audienceId?: string,
): Promise<void> {
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.headers) throw new APIError("BAD_REQUEST");
	if (!opts.audiencePrivileges) return;
	const allowed = await opts.audiencePrivileges({
		headers: ctx.headers,
		action,
		session: session.session,
		user: session.user,
		audienceId,
	});
	if (!allowed) throw new APIError("UNAUTHORIZED");
}

const audienceModel = (opts: OAuthOptions<Scope[]>) =>
	opts.schema?.oauthAudience?.modelName ?? "oauthAudience";

const linkModel = (opts: OAuthOptions<Scope[]>) =>
	opts.schema?.oauthClientAudience?.modelName ?? "oauthClientAudience";

/**
 * Decode a URL path-segment parameter.
 *
 * better-call's router (better-call@1.3.5) does NOT decode path params —
 * `tryDecode` is wired into cookie parsing only. So a raw HTTP caller hitting
 * `/admin/oauth2/audiences/https%3A%2F%2Fapi.example.com` lands here with
 * `ctx.params.identifier === "https%3A%2F%2Fapi.example.com"`, which never
 * matches the stored `https://api.example.com` row. Decode every path
 * segment that holds a URI-valued identifier so the admin handlers behave
 * identically to in-process `auth.api.*` calls (which pass already-decoded
 * JS strings).
 *
 * Falls back to the raw string when decode fails so a malformed identifier
 * surfaces as a clean NOT_FOUND from the row lookup rather than a 500.
 *
 * @internal
 */
function decodePathParam(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

// `validateIdentifier` is shared with the seed path — see
// {@link assertIdentifierValid} in `../audiences.ts`.

/**
 * Builds the create-payload from a normalized input. Fills in defaults
 * for the fields seedAudiences uses so the admin-CRUD and seed paths
 * write identical rows.
 *
 * @internal
 */
function buildAudienceRow(input: OAuthAudienceInput, now: Date) {
	return {
		identifier: input.identifier,
		name: input.name ?? input.identifier,
		accessTokenTtl: input.accessTokenTtl ?? null,
		refreshTokenTtl: input.refreshTokenTtl ?? null,
		signingAlgorithm: input.signingAlgorithm ?? null,
		signingKeyId: input.signingKeyId ?? null,
		allowedScopes: input.allowedScopes ?? null,
		customClaims: input.customClaims ?? null,
		disabled: input.disabled ?? false,
		policyVersion: 1,
		metadata: input.metadata ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

export async function createAudienceEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertAudiencePrivileges(ctx, session, opts, "create");

	const input = ctx.body as OAuthAudienceInput;
	if (!input?.identifier) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: "identifier is required",
		});
	}
	await assertIdentifierValid(opts, input.identifier);

	const existing = await ctx.context.adapter.findOne<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: input.identifier }],
	});
	if (existing) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `audience ${input.identifier} already exists`,
		});
	}

	const now = new Date();
	const created = await ctx.context.adapter.create<
		ReturnType<typeof buildAudienceRow>,
		OAuthAudience
	>({
		model: audienceModel(opts),
		data: buildAudienceRow(input, now),
	});
	invalidateAudienceCache(created.identifier);
	return ctx.json(created, { status: 201 });
}

export async function listAudiencesEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertAudiencePrivileges(ctx, session, opts, "list");
	const rows = await ctx.context.adapter.findMany<OAuthAudience>({
		model: audienceModel(opts),
	});
	return ctx.json(rows ?? []);
}

export async function getAudienceByIdentifierEndpoint(
	ctx: GenericEndpointContext & { params: { identifier: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertAudiencePrivileges(ctx, session, opts, "read", identifier);
	const row = await ctx.context.adapter.findOne<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!row) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${identifier} not found`,
		});
	}
	return ctx.json(row);
}

export async function updateAudienceEndpoint(
	ctx: GenericEndpointContext & {
		params: { identifier: string };
		body: Partial<OAuthAudienceInput>;
	},
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertAudiencePrivileges(ctx, session, opts, "update", identifier);

	const existing = await ctx.context.adapter.findOne<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!existing) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${identifier} not found`,
		});
	}

	// Build a minimal PATCH payload — only fields explicitly present in the
	// request body are touched. Identifier is immutable (it's the key).
	const update: Record<string, unknown> = { updatedAt: new Date() };
	const allowed: Array<keyof OAuthAudienceInput> = [
		"name",
		"accessTokenTtl",
		"refreshTokenTtl",
		"signingAlgorithm",
		"signingKeyId",
		"allowedScopes",
		"customClaims",
		"disabled",
		"metadata",
	];
	for (const key of allowed) {
		if (Object.prototype.hasOwnProperty.call(ctx.body, key)) {
			update[key] = ctx.body[key];
		}
	}

	await ctx.context.adapter.update<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: identifier }],
		update,
	});
	invalidateAudienceCache(identifier);
	// `adapter.update` may return `null` or non-fresh data (see the Adapter
	// contract). Re-fetch the row so the response always reflects what was
	// persisted rather than serializing a `null` body for a row that exists.
	const refreshed = await ctx.context.adapter.findOne<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!refreshed) {
		// Row vanished between the update and the re-read (concurrent delete).
		// Surface a clean 404 instead of a null body.
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${identifier} not found`,
		});
	}
	return ctx.json(refreshed);
}

export async function deleteAudienceEndpoint(
	ctx: GenericEndpointContext & { params: { identifier: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertAudiencePrivileges(ctx, session, opts, "delete", identifier);

	// Verify the row exists so we can return a clean 404 (vs. an opaque
	// "0 rows affected" result from the adapter).
	const existing = await ctx.context.adapter.findOne<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!existing) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${identifier} not found`,
		});
	}

	await ctx.context.adapter.delete({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	// Hard-invalidate the cache on delete — RFC open question §1 says
	// existing tokens for a deleted audience should be cascade-rejected on
	// next verify, which depends on `getAudience` returning null promptly.
	invalidateAudienceCache(identifier);
	return ctx.json({ deleted: true });
}

/**
 * Link a client to an audience.
 *
 * Route: `POST /admin/oauth2/audiences/:identifier/clients/:client_id`.
 * Path params carry the identifiers (RESTful linkage) — no body required.
 * Used by admins when {@link OAuthOptions.enforcePerClientAudiences} is on.
 */
export async function linkClientAudienceEndpoint(
	ctx: GenericEndpointContext & {
		params: { identifier: string; client_id: string };
	},
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	const audienceId = decodePathParam(ctx.params.identifier);
	const clientId = decodePathParam(ctx.params.client_id);
	await assertAudiencePrivileges(ctx, session, opts, "link", audienceId);

	// Confirm both ends exist so the FK cascade doesn't surface as a
	// generic 500.
	const audience = await ctx.context.adapter.findOne<OAuthAudience>({
		model: audienceModel(opts),
		where: [{ field: "identifier", value: audienceId }],
	});
	if (!audience) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${audienceId} not found`,
		});
	}
	const client = await ctx.context.adapter.findOne({
		model: "oauthClient",
		where: [{ field: "clientId", value: clientId }],
	});
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `client ${clientId} not found`,
		});
	}

	// Idempotency: the row's `id` is the deterministic
	// `${clientId}::${audienceId}` value, so duplicate inserts hit the
	// primary-key UNIQUE constraint and surface as an adapter error. We
	// optimistically attempt the insert and convert that conflict into the
	// existing "alreadyLinked: true" response — race-safe (two concurrent
	// admin calls both can't create the same row) without a TOCTOU gap
	// between findMany and create.
	const id = buildClientAudienceLinkId(clientId, audienceId);
	try {
		await ctx.context.adapter.create({
			model: linkModel(opts),
			forceAllowId: true,
			data: {
				id,
				clientId,
				audienceId,
				createdAt: new Date(),
			} as never,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/unique|duplicate|UNIQUE/i.test(message)) {
			return ctx.json({ linked: true, alreadyLinked: true });
		}
		throw err;
	}
	return ctx.json({ linked: true });
}

/**
 * Unlink a client from an audience.
 *
 * Route: `DELETE /admin/oauth2/audiences/:identifier/clients/:client_id`.
 * Path params carry the identifiers (RESTful linkage) — no body required.
 */
export async function unlinkClientAudienceEndpoint(
	ctx: GenericEndpointContext & {
		params: { identifier: string; client_id: string };
	},
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	const audienceId = decodePathParam(ctx.params.identifier);
	const clientId = decodePathParam(ctx.params.client_id);
	await assertAudiencePrivileges(ctx, session, opts, "unlink", audienceId);

	await ctx.context.adapter.deleteMany({
		model: linkModel(opts),
		where: [
			{ field: "clientId", value: clientId },
			{ field: "audienceId", value: audienceId },
		],
	});
	return ctx.json({ unlinked: true });
}
