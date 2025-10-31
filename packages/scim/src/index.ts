import {
	type Account,
	type BetterAuthPlugin,
	type DBAdapter,
	type User,
} from "better-auth";
import { APIError } from "better-auth/api";
import { createAuthEndpoint, type Member } from "better-auth/plugins";
import * as z from "zod/v4";
import { authMiddleware } from "./middlewares";
import {
	createUserResource,
	getUserFullName,
	getUserPrimaryEmail,
	getUserResourceLocation,
} from "./normalizers";
import { applyUserPatch } from "./patch-operations";
import { parseSCIMUserFilter, SCIMParseError } from "./scim-filters";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIMUserResourceSchema,
	SCIMUserResourceType,
} from "./user-schemas";

const supportedSCIMSchemas = [SCIMUserResourceSchema];
const supportedSCIMResourceTypes = [SCIMUserResourceType];

const findUserById = async (
	adapter: DBAdapter,
	{ organizationId, userId }: { organizationId: string; userId: string },
) => {
	const member = await adapter.findOne<Member>({
		model: "member",
		where: [
			{ field: "organizationId", value: organizationId },
			{ field: "userId", value: userId },
		],
	});

	if (member) {
		return await adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
	}

	return null;
};

export const scim = () => {
	return {
		id: "scim",
		endpoints: {
			createUser: createAuthEndpoint(
				"/scim/v2/Users",
				{
					method: "POST",
					body: APIUserSchema,
					metadata: {
						openapi: {
							summary: "Create SCIM user.",
							description:
								"Provision a new user into the linked organization via SCIM. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.3",
							responses: {
								"201": {
									description: "SCIM user resource",
									content: {
										"application/json": {
											schema: OpenAPIUserResourceSchema,
										},
									},
								},
							},
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					const body = ctx.body;
					const accountId = body.externalId ?? body.userName;

					const existingAccount = await ctx.context.adapter.findOne<Account>({
						model: "account",
						where: [{ field: "accountId", value: accountId }],
					});

					if (existingAccount) {
						throw new APIError("CONFLICT", {
							message: "User already exists",
							scimType: "uniqueness",
						});
					}

					const [newUser, newAccount] = await ctx.context.adapter.transaction<
						[User, Account, Member]
					>(async () => {
						const primaryEmail = getUserPrimaryEmail(body.emails);
						const email = primaryEmail ?? body.userName;
						const name = getUserFullName(email, body.name);

						const user = await ctx.context.adapter.create<User>({
							model: "user",
							data: {
								email,
								name,
								emailVerified: true,
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						const account = await ctx.context.adapter.create<Account>({
							model: "account",
							data: {
								userId: user.id,
								providerId: ctx.context.scimProvider.providerId,
								accountId: accountId,
								createdAt: new Date(),
								updatedAt: new Date(),
								accessToken: "",
								refreshToken: "",
							},
						});

						const organizationId = ctx.context.scimProvider.organizationId;
						const member = await ctx.context.adapter.create<Member>({
							model: "member",
							data: {
								organizationId,
								userId: user.id,
								role: "member",
								createdAt: new Date(),
							},
						});

						return [user, account, member];
					});

					const userResource = createUserResource(
						ctx.context.baseURL,
						newUser,
						newAccount,
					);

					return ctx.json(userResource, {
						status: 201,
						headers: {
							location: getUserResourceLocation(
								ctx.context.baseURL,
								newUser.id,
							),
						},
					});
				},
			),
			updateUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "PUT",
					body: APIUserSchema,
					metadata: {
						openapi: {
							summary: "Update SCIM user.",
							description:
								"Updates an existing user into the linked organization via SCIM. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.3",
							responses: {
								"201": {
									description: "SCIM user resource",
									content: {
										"application/json": {
											schema: OpenAPIUserResourceSchema,
										},
									},
								},
							},
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					const body = ctx.body;
					const userId = ctx.params.userId;
					const organizationId = ctx.context.scimProvider.organizationId;
					const accountId = body.externalId ?? body.userName;

					const user = await findUserById(ctx.context.adapter, {
						userId,
						organizationId,
					});

					if (!user) {
						return ctx.json({ error: "User not found" }, { status: 404 });
					}

					const [updatedUser, updatedAccount] =
						await ctx.context.adapter.transaction<
							[User | null, Account | null]
						>(async () => {
							const primaryEmail = getUserPrimaryEmail(body.emails);
							const email = primaryEmail ?? body.userName;
							const name = getUserFullName(email, body.name);

							const updatedUser = await ctx.context.adapter.update<User>({
								model: "user",
								where: [{ field: "id", value: userId }],
								update: {
									email,
									name,
									updatedAt: new Date(),
								},
							});

							const updatedAccount = await ctx.context.adapter.update<Account>({
								model: "account",
								where: [{ field: "userId", value: userId }],
								update: {
									accountId,
									updatedAt: new Date(),
								},
							});

							return [updatedUser, updatedAccount];
						});

					const userResource = createUserResource(
						ctx.context.baseURL,
						updatedUser!,
						updatedAccount,
					);

					return ctx.json(userResource, {
						status: 200,
					});
				},
			),
			listUsers: createAuthEndpoint(
				"/scim/v2/Users",
				{
					method: "GET",
					query: z
						.object({
							filter: z.string().optional(),
						})
						.optional(),
					metadata: {
						openapi: {
							summary: "List SCIM users",
							description:
								"Returns all users provisioned via SCIM for the linked organization. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.4.2",
							responses: {
								"200": {
									description: "SCIM user list",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													totalResults: { type: "number" },
													itemsPerPage: { type: "number" },
													startIndex: { type: "number" },
													Resources: {
														type: "array",
														items: OpenAPIUserResourceSchema,
													},
												},
											},
										},
									},
								},
							},
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					let filters = [];
					try {
						filters = parseSCIMUserFilter(ctx.query?.filter ?? "");
					} catch (error) {
						throw new APIError("BAD_REQUEST", {
							message:
								error instanceof SCIMParseError
									? error.message
									: "Invalid SCIM filter",
							scimType: "invalidFilter",
						});
					}

					ctx.context.logger.info("Querying result with filters: ", filters);

					const organizationId = ctx.context.scimProvider.organizationId;
					const members = await ctx.context.adapter.findMany<Member>({
						model: "member",
						where: [{ field: "organizationId", value: organizationId }],
					});

					const userIds = members.map((member) => member.userId);

					const [users, accounts] = await Promise.all([
						ctx.context.adapter.findMany<User>({
							model: "user",
							where: [
								{ field: "id", value: userIds, operator: "in" },
								...filters,
							],
						}),
						ctx.context.adapter.findMany<Account>({
							model: "account",
							where: [{ field: "userId", value: userIds, operator: "in" }],
						}),
					]);

					return ctx.json({
						schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
						totalResults: users.length,
						startIndex: 1,
						itemsPerPage: users.length,
						Resources: users.map((user) => {
							const account = accounts.find((a) => a.userId === user.id);
							return createUserResource(ctx.context.baseURL, user, account);
						}),
					});
				},
			),
			getUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "Get SCIM user details",
							description:
								"Returns the provisioned SCIM user details. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.4.1",
							responses: {
								"200": {
									description: "SCIM user resource",
									content: {
										"application/json": {
											schema: OpenAPIUserResourceSchema,
										},
									},
								},
							},
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					const userId = ctx.params.userId;
					const organizationId = ctx.context.scimProvider.organizationId;

					const [user, account] = await Promise.all([
						findUserById(ctx.context.adapter, {
							userId,
							organizationId,
						}),
						ctx.context.adapter.findOne<Account>({
							model: "account",
							where: [{ field: "userId", value: userId }],
						}),
					]);

					if (!user) {
						return ctx.json({ error: "User not found" }, { status: 404 });
					}

					return ctx.json(
						createUserResource(ctx.context.baseURL, user, account),
					);
				},
			),
			patchUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "PATCH",
					body: z.object({
						schemas: z
							.array(z.string())
							.refine(
								(s) =>
									s.includes("urn:ietf:params:scim:api:messages:2.0:PatchOp"),
								{
									message: "Invalid schemas for PatchOp",
								},
							),
						Operations: z.array(
							z.object({
								op: z.enum(["replace", "add", "remove"]).default("replace"),
								path: z.string().optional(),
								value: z.any(),
							}),
						),
					}),
					metadata: {
						openapi: {
							summary: "Patch SCIM user",
							description: "Updates fields on a SCIM user record",
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					const userId = ctx.params.userId;
					const organizationId = ctx.context.scimProvider.organizationId;

					const user = await findUserById(ctx.context.adapter, {
						userId,
						organizationId,
					});

					if (!user) {
						return ctx.json({ error: "User not found" }, { status: 404 });
					}

					const updates: Record<string, any> = {};
					for (const op of ctx.body.Operations) {
						if (op.op !== "replace") continue;

						const result = applyUserPatch(user, op);
						if (result) {
							updates[result.target] = result.value;
						}
					}

					if (Object.keys(updates).length === 0) {
						return ctx.json(
							{ error: "No valid fields to update" },
							{ status: 400 },
						);
					}

					await ctx.context.adapter.update<User>({
						model: "user",
						where: [{ field: "id", value: userId }],
						update: { ...updates, updatedAt: new Date() },
					});

					return ctx.json(null, { status: 204 });
				},
			),
			deleteUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "DELETE",
					metadata: {
						openapi: {
							summary: "Delete SCIM user",
							description:
								"Deletes (or deactivates) a user within the linked organization.",
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					const userId = ctx.params.userId;
					const organizationId = ctx.context.scimProvider.organizationId;

					const user = await findUserById(ctx.context.adapter, {
						userId,
						organizationId,
					});

					if (!user) {
						return ctx.json({ error: "User not found" }, { status: 404 });
					}

					await ctx.context.adapter.delete({
						model: "user",
						where: [{ field: "id", value: userId }],
					});

					return ctx.json(null, { status: 204 });
				},
			),
			getServiceProviderConfig: createAuthEndpoint(
				"/scim/v2/ServiceProviderConfig",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Configuration",
							description:
								"Standard SCIM metadata endpoint used by identity providers. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
							},
						},
					},
				},
				async (ctx) => {
					return ctx.json({
						patch: { supported: true },
						bulk: { supported: false },
						filter: { supported: true },
						changePassword: { supported: false },
						sort: { supported: false },
						etag: { supported: false },
						authenticationSchemes: [
							{
								name: "OAuth Bearer Token",
								description:
									"Authentication scheme using the Authorization header with a bearer token tied to an organization.",
								specUri: "http://www.rfc-editor.org/info/rfc6750",
								type: "oauthbearertoken",
								primary: true,
							},
						],
						schemas: [
							"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
						],
						meta: {
							resourceType: "ServiceProviderConfig",
						},
					});
				},
			),
			getSchemas: createAuthEndpoint(
				"/scim/v2/Schemas",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Configuration Schemas",
							description:
								"Standard SCIM metadata endpoint used by identity providers to acquire information about supported schemas. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
							},
						},
					},
				},
				async (ctx) => {
					return ctx.json({
						totalResults: supportedSCIMSchemas.length,
						itemsPerPage: supportedSCIMSchemas.length,
						startIndex: 1,
						schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
						Resources: supportedSCIMSchemas.map((s) => {
							return {
								...s,
								meta: {
									...s.meta,
									location: new URL(s.meta.location, ctx.context.baseURL),
								},
							};
						}),
					});
				},
			),
			getSchema: createAuthEndpoint(
				"/scim/v2/Schemas/:schemaId",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM a Service Provider Configuration Schema",
							description:
								"Standard SCIM metadata endpoint used by identity providers to acquire information about a given schema. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
							},
						},
					},
				},
				async (ctx) => {
					const schema = supportedSCIMSchemas.find(
						(s) => s.id === ctx.params.schemaId,
					);

					if (!schema) {
						return ctx.json({ error: "Schema not found" }, { status: 404 });
					}

					return ctx.json({
						...schema,
						meta: {
							...schema.meta,
							location: new URL(schema.meta.location, ctx.context.baseURL),
						},
					});
				},
			),
			getResourceTypes: createAuthEndpoint(
				"/scim/v2/ResourceTypes",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Suppoted Resource Types",
							description:
								"Standard SCIM metadata endpoint used by identity providers to get a list of server supported types. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
							},
						},
					},
				},
				async (ctx) => {
					return ctx.json({
						totalResults: supportedSCIMResourceTypes.length,
						itemsPerPage: supportedSCIMResourceTypes.length,
						startIndex: 1,
						schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
						Resources: supportedSCIMResourceTypes.map((s) => {
							return {
								...s,
								meta: {
									...s.meta,
									location: new URL(s.meta.location, ctx.context.baseURL),
								},
							};
						}),
					});
				},
			),
			getResourceType: createAuthEndpoint(
				"/scim/v2/ResourceTypes/:resourceTypeId",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Supported Resource Type",
							description:
								"Standard SCIM metadata endpoint used by identity providers to get a server supported type. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
							},
						},
					},
				},
				async (ctx) => {
					const schema = supportedSCIMSchemas.find(
						(s) => s.id === ctx.params.resourceTypeId,
					);

					if (!schema) {
						return ctx.json(
							{ error: "Resource type not found" },
							{ status: 404 },
						);
					}

					return ctx.json({
						...schema,
						meta: {
							...schema.meta,
							location: new URL(schema.meta.location, ctx.context.baseURL),
						},
					});
				},
			),
		},
		schema: {
			scimProvider: {
				fields: {
					providerId: {
						type: "string",
						required: true,
						unique: true,
					},
					scimToken: {
						type: "string",
						required: true,
						unique: true,
					},
					organizationId: {
						type: "string",
						required: false,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
