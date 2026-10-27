import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import {
	assertIdentifierValid,
	combineResource,
	ensureResourceRow,
	getConfiguredResource,
	getConfiguredResourcesWithoutRows,
	getResource,
	invalidateResourceCache,
	isResourceTombstoned,
	omitDeleted,
	withResourceInsertLock,
} from "../resources";
import type {
	OAuthOptions,
	OAuthResource,
	OAuthResourceInput,
	Scope,
} from "../types";
import { assertResourcePrivileges } from "./privileges";

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
 * so the admin-CRUD and configured-resource paths write identical rows.
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
		// FIXME(#11725): Prisma list columns reject null and read a stored
		// NULL back as [], so "no restriction" cannot round-trip there.
		allowedScopes: input.allowedScopes ?? null,
		customClaims: input.customClaims ?? null,
		dpopBoundAccessTokensRequired: input.dpopBoundAccessTokensRequired ?? false,
		disabled: input.disabled ?? false,
		policyVersion: 1,
		metadata: omitDeleted(input.metadata),
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
	if (input.metadata !== undefined) {
		input.metadata = omitDeleted(input.metadata) ?? undefined;
	}
	await assertIdentifierValid(opts, input.identifier);

	const existing = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: input.identifier }],
	});

	const now = new Date();
	const entry = await getConfiguredResource(opts, input.identifier);
	const mode = opts.resourceSeedMode ?? "insertOnly";

	if (existing) {
		if (isResourceTombstoned(existing)) {
			const rowData = buildResourceRow(input, now);
			await ctx.context.adapter.update<OAuthResource>({
				model: resourceModel(opts),
				where: [{ field: "identifier", value: input.identifier }],
				update: {
					...rowData,
					createdAt: existing.createdAt ?? now,
					updatedAt: now,
				},
			});
			invalidateResourceCache(input.identifier);
			const refreshed = await ctx.context.adapter.findOne<OAuthResource>({
				model: resourceModel(opts),
				where: [{ field: "identifier", value: input.identifier }],
			});
			const responseResource = entry
				? combineResource(refreshed ?? (rowData as OAuthResource), entry, mode)
				: (refreshed ?? (rowData as OAuthResource));
			return ctx.json(responseResource, { status: 201 });
		}
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `resource ${input.identifier} already exists`,
		});
	}

	const configured = entry;
	if (configured && !isResourceTombstoned(configured.resource)) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `resource ${input.identifier} already exists`,
			message: "resource already exists",
		});
	}

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
	const responseResource = entry
		? combineResource(created, entry, mode)
		: created;
	return ctx.json(responseResource, { status: 201 });
}

export async function listResourcesEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "list");
	const rows =
		(await ctx.context.adapter.findMany<OAuthResource>({
			model: resourceModel(opts),
		})) ?? [];
	const mode = opts.resourceSeedMode ?? "insertOnly";
	const activeRows = rows.filter((row) => !isResourceTombstoned(row));
	const combinedRows = await Promise.all(
		activeRows.map(async (row) => {
			const entry = await getConfiguredResource(opts, row.identifier);
			return entry ? combineResource(row, entry, mode) : row;
		}),
	);
	const configOnly = await getConfiguredResourcesWithoutRows(opts, rows);
	return ctx.json([...combinedRows, ...configOnly]);
}

export async function getResourceByIdentifierEndpoint(
	ctx: GenericEndpointContext & { params: { identifier: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "read", identifier);
	const resource = await getResource(ctx, opts, identifier);
	if (!resource) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}
	return ctx.json(resource);
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

	const mode = opts.resourceSeedMode ?? "insertOnly";
	const entry = await getConfiguredResource(opts, identifier);

	let existing = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (existing && isResourceTombstoned(existing)) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}
	if (!existing) {
		existing = await ensureResourceRow(ctx, opts, identifier);
	}
	if (!existing || isResourceTombstoned(existing)) {
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
	if ("metadata" in update) {
		update.metadata = omitDeleted(update.metadata);
	}

	const executeUpdate = async (txAdapter: typeof ctx.context.adapter) => {
		const latestRow = await txAdapter.findOne<OAuthResource>({
			model: resourceModel(opts),
			where: [{ field: "identifier", value: identifier }],
		});
		if (!latestRow || isResourceTombstoned(latestRow)) {
			throw new APIError("NOT_FOUND", {
				error: "not_found",
				error_description: `resource ${identifier} not found`,
			});
		}

		let latestMeta: Record<string, unknown> = {};
		if (latestRow.metadata) {
			if (typeof latestRow.metadata === "string") {
				try {
					const parsed = JSON.parse(latestRow.metadata);
					latestMeta =
						parsed && typeof parsed === "object"
							? (parsed as Record<string, unknown>)
							: {};
				} catch {
					latestMeta = {};
				}
			} else if (typeof latestRow.metadata === "object") {
				latestMeta = { ...(latestRow.metadata as Record<string, unknown>) };
			}
		}
		if (latestMeta.__deleted) {
			throw new APIError("NOT_FOUND", {
				error: "not_found",
				error_description: `resource ${identifier} not found`,
			});
		}

		await txAdapter.update<OAuthResource>({
			model: resourceModel(opts),
			where: [{ field: "identifier", value: identifier }],
			update,
		});
	};

	if (typeof ctx.context.adapter.transaction === "function") {
		await ctx.context.adapter.transaction(async (txAdapter) => {
			await executeUpdate(txAdapter as typeof ctx.context.adapter);
		});
	} else {
		await executeUpdate(ctx.context.adapter);
	}

	invalidateResourceCache(identifier);
	// `adapter.update` may return `null` or non-fresh data (see the Adapter
	// contract). Re-fetch the row so the response always reflects what was
	// persisted rather than serializing a `null` body for a row that exists.
	const refreshed = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	if (!refreshed || isResourceTombstoned(refreshed)) {
		// Row vanished or was tombstoned between the update and the re-read.
		// Surface a clean 404 instead of a null body.
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}
	const responseResource = entry
		? combineResource(refreshed, entry, mode)
		: refreshed;
	return ctx.json(responseResource);
}

export async function deleteResourceEndpoint(
	ctx: GenericEndpointContext & { params: { identifier: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const identifier = decodePathParam(ctx.params.identifier);
	const session = await getSessionFromCtx(ctx);
	await assertResourcePrivileges(ctx, session, opts, "delete", identifier);

	const existing = await ctx.context.adapter.findOne<OAuthResource>({
		model: resourceModel(opts),
		where: [{ field: "identifier", value: identifier }],
	});
	const configured = await getConfiguredResource(opts, identifier);

	if (!existing && !configured) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}

	if (existing && isResourceTombstoned(existing)) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${identifier} not found`,
		});
	}

	const executeDelete = async (txAdapter: typeof ctx.context.adapter) => {
		const latestRow = await txAdapter.findOne<OAuthResource>({
			model: resourceModel(opts),
			where: [{ field: "identifier", value: identifier }],
		});
		if (!latestRow && !configured) {
			throw new APIError("NOT_FOUND", {
				error: "not_found",
				error_description: `resource ${identifier} not found`,
			});
		}
		if (latestRow && isResourceTombstoned(latestRow)) {
			throw new APIError("NOT_FOUND", {
				error: "not_found",
				error_description: `resource ${identifier} not found`,
			});
		}

		await txAdapter.deleteMany({
			model: linkModel(opts),
			where: [{ field: "resourceId", value: identifier }],
		});

		if (configured) {
			if (latestRow) {
				let existingMeta: Record<string, unknown> = {};
				if (latestRow.metadata) {
					if (typeof latestRow.metadata === "string") {
						try {
							const parsed = JSON.parse(latestRow.metadata);
							existingMeta =
								parsed && typeof parsed === "object"
									? (parsed as Record<string, unknown>)
									: {};
						} catch {
							existingMeta = {};
						}
					} else if (typeof latestRow.metadata === "object") {
						existingMeta = {
							...(latestRow.metadata as Record<string, unknown>),
						};
					}
				}

				await txAdapter.update<OAuthResource>({
					model: resourceModel(opts),
					where: [{ field: "identifier", value: identifier }],
					update: {
						disabled: true,
						metadata: {
							...existingMeta,
							__deleted: true,
						},
						updatedAt: new Date(),
					},
				});
			} else {
				await txAdapter.create<OAuthResource>({
					model: resourceModel(opts),
					data: {
						identifier,
						name: configured.resource.name ?? identifier,
						allowedScopes: configured.resource.allowedScopes ?? [],
						disabled: true,
						metadata: {
							__deleted: true,
						},
						policyVersion: 1,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
			}
		} else {
			await txAdapter.delete({
				model: resourceModel(opts),
				where: [{ field: "identifier", value: identifier }],
			});
		}
	};

	await withResourceInsertLock(
		ctx.context.adapter,
		`${resourceModel(opts)}:${identifier}`,
		async () => {
			const runDelete = async () => {
				if (typeof ctx.context.adapter.transaction === "function") {
					await ctx.context.adapter.transaction(async (txAdapter) => {
						await executeDelete(txAdapter as typeof ctx.context.adapter);
					});
				} else {
					await executeDelete(ctx.context.adapter);
				}
			};

			try {
				await runDelete();
			} catch (err) {
				if (err instanceof APIError) {
					throw err;
				}
				const message = err instanceof Error ? err.message : String(err);
				if (/unique|duplicate|UNIQUE/i.test(message)) {
					const winner = await ctx.context.adapter.findOne<OAuthResource>({
						model: resourceModel(opts),
						where: [{ field: "identifier", value: identifier }],
					});
					if (winner && isResourceTombstoned(winner)) {
						throw new APIError("NOT_FOUND", {
							error: "not_found",
							error_description: `resource ${identifier} not found`,
						});
					}
					await runDelete();
					return;
				}
				throw err;
			}
		},
	);

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
	const resource = await getResource(ctx, opts, resourceId);
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

	const ensured = await ensureResourceRow(ctx, opts, resourceId);
	if (!ensured || isResourceTombstoned(ensured)) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `resource ${resourceId} not found`,
		});
	}

	// The compound unique index makes this optimistic insert race-safe.
	try {
		await ctx.context.adapter.create({
			model: linkModel(opts),
			data: {
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
