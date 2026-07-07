import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { Session, User } from "better-auth/types";
import {
	assertIdentifierValid,
	buildClientResourceLinkId,
	invalidateResourceCache,
} from "../resources";
import type {
	OAuthOptions,
	OAuthResource,
	OAuthResourceInput,
	Scope,
} from "../types";

/**
 * Action types passed to {@link OAuthOptions.resourcePrivileges}. Mirrors
 * the `clientPrivileges` action vocabulary so admins can reuse the same
 * RBAC patterns.
 */
type ResourceAction =
	| "create"
	| "read"
	| "update"
	| "delete"
	| "list"
	| "link"
	| "unlink";

/**
 * Gate every admin resource endpoint. Mirrors `assertClientPrivileges`:
 * a missing session → 401; a defined `resourcePrivileges` callback that
 * returns falsy → 401 with the original action context preserved.
 *
 * When `resourcePrivileges` is undefined, the gate degrades to "any
 * authenticated session can manage resources" — same forgiving default
 * as `clientPrivileges`. Operators who care about RBAC must define the
 * callback.
 *
 * @internal
 */
async function assertResourcePrivileges(
	ctx: GenericEndpointContext,
	session: { session: Session; user: User } | null,
	opts: OAuthOptions<Scope[]>,
	action: ResourceAction,
	resourceId?: string,
): Promise<void> {
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.headers) throw new APIError("BAD_REQUEST");
	if (!opts.resourcePrivileges) return;
	const allowed = await opts.resourcePrivileges({
		headers: ctx.headers,
		action,
		session: session.session,
		user: session.user,
		resourceId,
	});
	if (!allowed) throw new APIError("UNAUTHORIZED");
}

const resourceModel = (opts: OAuthOptions<Scope[]>) =>
	opts.schema?.oauthResource?.modelName ?? "oauthResource";

const linkModel = (opts: OAuthOptions<Scope[]>) =>
	opts.schema?.oauthClientResource?.modelName ?? "oauthClientResource";

const clientModel = (opts: OAuthOptions<Scope[]>) =>
	opts.schema?.oauthClient?.modelName ?? "oauthClient";

/**
 * Decode a URL path-segment parameter.
 *
 * better-call's router (better-call@1.3.5) does NOT decode path params —
 * `tryDecode` is wired into cookie parsing only. So a raw HTTP caller hitting
 * `/admin/oauth2/resources/https%3A%2F%2Fapi.example.com` lands here with
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
// {@link assertIdentifierValid} in `../resources.ts`.

/**
 * Builds the create-payload from a normalized input. Fills in defaults
 * for the fields seedResources uses so the admin-CRUD and seed paths
 * write identical rows.
 *
 * @internal
 */
function buildResourceRow(input: OAuthResourceInput, now: Date) {
	return {
		identifier: input.identifier,
		name: input.name ?? input.identifier,
		accessTokenTtl: input.accessTokenTtl ?? null,
		refreshTokenTtl: input.refreshTokenTtl ?? null,
		signingAlgorithm: input.signingAlgorithm ?? null,
		signingKeyId: input.signingKeyId ?? null,
		allowedScopes: input.allowedScopes ?? null,
		customClaims: input.customClaims ?? null,
		dpopBoundAccessTokensRequired: input.dpopBoundAccessTokensRequired ?? false,
		disabled: input.disabled ?? false,
		policyVersion: 1,
		metadata: input.metadata ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

export async function createResourceEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "create");

	const input = ctx.body as OAuthResourceInput;
	if (!input?.identifier) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: "identifier is required",
		});
	}
	await assertIdentifierValid(opts, input.identifier);

	const now = new Date();
	let created: OAuthResource;
	try {
		created = await ctx.context.adapter.create<
			ReturnType<typeof buildResourceRow>,
			OAuthResource
		>({
			model: resourceModel(opts),
			data: buildResourceRow(input, now),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/unique|duplicate|UNIQUE/i.test(message)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: `resource ${input.identifier} already exists`,
			});
		}
		throw err;
	}
	if (!created) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `resource ${input.identifier} could not be created`,
		});
	}
	invalidateResourceCache(created.identifier);
	return ctx.json(created, { status: 201 });
}

export async function listResourcesEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "list");
	const rows = await ctx.context.adapter.findMany<OAuthResource>({
		model: resourceModel(opts),
	});
	return ctx.json(rows ?? []);
}

export async function getResourceByIdentifierEndpoint(
	ctx: GenericEndpointContext & { params: { identifier: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "read", identifier);
	const row = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!row) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}
	return ctx.json(row);
}

export async function updateResourceEndpoint(
	ctx: GenericEndpointContext & {
		params: { identifier: string };
		body: Partial<OAuthResourceInput>;
	},
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "update", identifier);

	const existing = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!existing) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}

	// Build a minimal PATCH payload — only fields explicitly present in the
	// request body are touched. Identifier is immutable (it's the key).
	const update: Record<string, unknown> = { updatedAt: new Date() };
	const allowed: Array<keyof OAuthResourceInput> = [
		"name",
		"accessTokenTtl",
		"refreshTokenTtl",
		"signingAlgorithm",
		"signingKeyId",
		"allowedScopes",
		"customClaims",
		"dpopBoundAccessTokensRequired",
		"disabled",
		"metadata",
	];
	for (const key of allowed) {
		if (Object.prototype.hasOwnProperty.call(ctx.body, key)) {
			update[key] = ctx.body[key];
		}
	}

	await ctx.context.adapter.update<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
		update,
	});
	invalidateResourceCache(identifier);
	// `adapter.update` may return `null` or non-fresh data (see the Adapter
	// contract). Re-fetch the row so the response always reflects what was
	// persisted rather than serializing a `null` body for a row that exists.
	const refreshed = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!refreshed) {
		// Row vanished between the update and the re-read (concurrent delete).
		// Surface a clean 404 instead of a null body.
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}
	return ctx.json(refreshed);
}

export async function deleteResourceEndpoint(
	ctx: GenericEndpointContext & { params: { identifier: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "delete", identifier);

	// Verify the row exists so we can return a clean 404 (vs. an opaque
	// "0 rows affected" result from the adapter).
	const existing = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!existing) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}

	await ctx.context.adapter.delete({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	// Hard-invalidate the cache on delete — RFC open question §1 says
	// existing tokens for a deleted resource should be cascade-rejected on
	// next verify, which depends on `getResource` returning null promptly.
	invalidateResourceCache(identifier);
	return ctx.json({ deleted: true });
}

/**
 * Link a client to a resource.
 *
 * Route: `POST /admin/oauth2/resources/:identifier/clients/:client_id`.
 * Path params carry the identifiers (RESTful linkage) — no body required.
 * Used by admins when {@link OAuthOptions.enforcePerClientResources} is on.
 */
export async function linkClientResourceEndpoint(
	ctx: GenericEndpointContext & {
		params: { identifier: string; client_id: string };
	},
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	const resourceId = decodePathParam(ctx.params.identifier);
	const clientId = decodePathParam(ctx.params.client_id);
	await assertResourcePrivileges(ctx, session, opts, "link", resourceId);

	// Confirm both ends exist so the FK cascade doesn't surface as a
	// generic 500.
	const resource = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: resourceId }],
	});
	if (!resource) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${resourceId} not found`,
		});
	}
	const client = await ctx.context.adapter.findOne({
		model: clientModel(opts),
		where: [{ field: "clientId", value: clientId }],
	});
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `client ${clientId} not found`,
		});
	}

	// Idempotency: the row's `id` is the deterministic
	// `${clientId}::${resourceId}` value, so duplicate inserts hit the
	// primary-key UNIQUE constraint and surface as an adapter error. We
	// optimistically attempt the insert and convert that conflict into the
	// existing "alreadyLinked: true" response — race-safe (two concurrent
	// admin calls both can't create the same row) without a TOCTOU gap
	// between findMany and create.
	const id = buildClientResourceLinkId(clientId, resourceId);
	try {
		await ctx.context.adapter.create({
			model: linkModel(opts),
			forceAllowId: true,
			data: {
				id,
				clientId,
				resourceId,
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
 * Unlink a client from a resource.
 *
 * Route: `DELETE /admin/oauth2/resources/:identifier/clients/:client_id`.
 * Path params carry the identifiers (RESTful linkage) — no body required.
 */
export async function unlinkClientResourceEndpoint(
	ctx: GenericEndpointContext & {
		params: { identifier: string; client_id: string };
	},
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	const resourceId = decodePathParam(ctx.params.identifier);
	const clientId = decodePathParam(ctx.params.client_id);
	await assertResourcePrivileges(ctx, session, opts, "unlink", resourceId);

	await ctx.context.adapter.deleteMany({
		model: linkModel(opts),
		where: [
			{ field: "clientId", value: clientId },
			{ field: "resourceId", value: resourceId },
		],
	});
	return ctx.json({ unlinked: true });
}
