import { base64Url } from "@better-auth/utils/base64";
import type { Account, DBAdapter, User } from "better-auth";
import { APIError, sessionMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import type { Member } from "better-auth/plugins";
import { createAuthEndpoint } from "better-auth/plugins";
import * as z from "zod";
import { getAccountId, getUserFullName, getUserPrimaryEmail } from "./mappings";
import type { AuthMiddleware } from "./middlewares";
import { buildUserPatch } from "./patch-operations";
import { SCIMAPIError, SCIMErrorOpenAPISchemas } from "./scim-error";
import type { DBFilter } from "./scim-filters";
import { parseSCIMUserFilter, SCIMParseError } from "./scim-filters";
import {
	ResourceTypeOpenAPISchema,
	SCIMSchemaOpenAPISchema,
	ServiceProviderOpenAPISchema,
} from "./scim-metadata";
import { createUserResource } from "./scim-resources";
import { storeSCIMToken } from "./scim-tokens";
import type { SCIMOptions, SCIMProvider } from "./types";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIMUserResourceSchema,
	SCIMUserResourceType,
} from "./user-schemas";
import { getResourceURL } from "./utils";

const supportedSCIMSchemas = [SCIMUserResourceSchema];
const supportedSCIMResourceTypes = [SCIMUserResourceType];
const supportedMediaTypes = ["application/json", "application/scim+json"];

const generateSCIMTokenBodySchema = z.object({
	providerId: z.string().meta({ description: "Unique provider identifier" }),
	organizationId: z
		.string()
		.optional()
		.meta({ description: "Optional organization id" }),
});

export const generateSCIMToken = (opts: SCIMOptions) =>
	createAuthEndpoint(
		"/scim/generate-token",
		{
			method: "POST",
			body: generateSCIMTokenBodySchema,
			metadata: {
				openapi: {
					summary: "Generates a new SCIM token for the given provider",
					description:
						"Generates a new SCIM token to be used for SCIM operations",
					responses: {
						"201": {
							description: "SCIM token response",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											scimToken: {
												description: "SCIM token",
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
			},
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const { providerId, organizationId } = ctx.body;
			const user = ctx.context.session.user;

			if (providerId.includes(":")) {
				throw new APIError("BAD_REQUEST", {
					message: "Provider id contains forbidden characters",
				});
			}

			const isOrgPluginEnabled = ctx.context.options.plugins?.some(
				(p) => p.id === "organization",
			);

			if (organizationId && !isOrgPluginEnabled) {
				throw new APIError("BAD_REQUEST", {
					message:
						"Restricting a token to an organization requires the organization plugin",
				});
			}

			let member: Member | null = null;
			if (organizationId) {
				member = await ctx.context.adapter.findOne<Member>({
					model: "member",
					where: [
						{
							field: "userId",
							value: user.id,
						},
						{
							field: "organizationId",
							value: organizationId,
						},
					],
				});

				if (!member) {
					throw new APIError("FORBIDDEN", {
						message: "You are not a member of the organization",
					});
				}
			}

			const scimProvider = await ctx.context.adapter.findOne<SCIMProvider>({
				model: "scimProvider",
				where: [
					{ field: "providerId", value: providerId },
					...(organizationId
						? [{ field: "organizationId", value: organizationId }]
						: []),
				],
			});

			if (scimProvider) {
				await ctx.context.adapter.delete<SCIMProvider>({
					model: "scimProvider",
					where: [{ field: "id", value: scimProvider.id }],
				});
			}

			const baseToken = generateRandomString(24);
			const scimToken = base64Url.encode(
				`${baseToken}:${providerId}${organizationId ? `:${organizationId}` : ""}`,
			);

			if (opts.beforeSCIMTokenGenerated) {
				await opts.beforeSCIMTokenGenerated({
					user,
					member,
					scimToken,
				});
			}

			const newSCIMProvider = await ctx.context.adapter.create<SCIMProvider>({
				model: "scimProvider",
				data: {
					providerId: providerId,
					organizationId: organizationId,
					scimToken: await storeSCIMToken(ctx, opts, baseToken),
				},
			});

			if (opts.afterSCIMTokenGenerated) {
				await opts.afterSCIMTokenGenerated({
					user,
					member,
					scimToken,
					scimProvider: newSCIMProvider,
				});
			}

			ctx.setStatus(201);

			return ctx.json({
				scimToken,
			});
		},
	);

export const createSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users",
		{
			method: "POST",
			body: APIUserSchema,
			metadata: {
				isAction: false,
				allowedMediaTypes: supportedMediaTypes,
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
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const providerId = ctx.context.scimProvider.providerId;
			const accountId = getAccountId(body.userName, body.externalId);

			const existingAccount = await ctx.context.adapter.findOne<Account>({
				model: "account",
				where: [
					{ field: "accountId", value: accountId },
					{ field: "providerId", value: providerId },
				],
			});

			if (existingAccount) {
				throw new SCIMAPIError("CONFLICT", {
					detail: "User already exists",
					scimType: "uniqueness",
				});
			}

			const email = getUserPrimaryEmail(body.userName, body.emails);
			const name = getUserFullName(email, body.name);

			const existingUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: email }],
			});

			const createAccount = (userId: string) =>
				ctx.context.internalAdapter.createAccount({
					userId: userId,
					providerId: providerId,
					accountId: accountId,
					accessToken: "",
					refreshToken: "",
				});

			const createUser = () =>
				ctx.context.internalAdapter.createUser({
					email,
					name,
				});

			const createOrgMembership = async (userId: string) => {
				const organizationId = ctx.context.scimProvider.organizationId;

				if (organizationId) {
					const isOrgMember = await ctx.context.adapter.findOne({
						model: "member",
						where: [
							{ field: "organizationId", value: organizationId },
							{ field: "userId", value: userId },
						],
					});

					if (!isOrgMember) {
						return await ctx.context.adapter.create<Member>({
							model: "member",
							data: {
								userId: userId,
								role: "member",
								createdAt: new Date(),
								organizationId,
							},
						});
					}
				}
			};

			let user: User;
			let account: Account;

			if (existingUser) {
				user = existingUser;
				account = await ctx.context.adapter.transaction<Account>(async () => {
					const account = await createAccount(user.id);
					await createOrgMembership(user.id);
					return account;
				});
			} else {
				[user, account] = await ctx.context.adapter.transaction<
					[User, Account]
				>(async () => {
					const user = await createUser();
					const account = await createAccount(user.id);
					await createOrgMembership(user.id);
					return [user, account];
				});
			}

			const userResource = createUserResource(
				ctx.context.baseURL,
				user,
				account,
			);

			ctx.setStatus(201);
			ctx.setHeader("location", userResource.meta.location);
			return ctx.json(userResource);
		},
	);

export const updateSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "PUT",
			body: APIUserSchema,
			metadata: {
				isAction: false,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Update SCIM user.",
					description:
						"Updates an existing user into the linked organization via SCIM. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.3",
					responses: {
						"200": {
							description: "SCIM user resource",
							content: {
								"application/json": {
									schema: OpenAPIUserResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const userId = ctx.params.userId;
			const { organizationId, providerId } = ctx.context.scimProvider;
			const accountId = getAccountId(body.userName, body.externalId);

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			const [updatedUser, updatedAccount] =
				await ctx.context.adapter.transaction<[User | null, Account | null]>(
					async () => {
						const email = getUserPrimaryEmail(body.userName, body.emails);
						const name = getUserFullName(email, body.name);

						const updatedUser = await ctx.context.internalAdapter.updateUser(
							userId,
							{
								email,
								name,
								updatedAt: new Date(),
							},
						);

						const updatedAccount =
							await ctx.context.internalAdapter.updateAccount(account.id, {
								accountId,
								updatedAt: new Date(),
							});

						return [updatedUser, updatedAccount];
					},
				);

			const userResource = createUserResource(
				ctx.context.baseURL,
				updatedUser!,
				updatedAccount,
			);

			return ctx.json(userResource);
		},
	);

const listSCIMUsersQuerySchema = z
	.object({
		filter: z.string().optional(),
	})
	.optional();

export const listSCIMUsers = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users",
		{
			method: "GET",
			query: listSCIMUsersQuerySchema,
			metadata: {
				isAction: false,
				allowedMediaTypes: supportedMediaTypes,
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
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			let apiFilters: DBFilter[] = parseSCIMAPIUserFilter(ctx.query?.filter);

			ctx.context.logger.info("Querying result with filters: ", apiFilters);

			const providerId = ctx.context.scimProvider.providerId;
			const accounts = await ctx.context.adapter.findMany<Account>({
				model: "account",
				where: [{ field: "providerId", value: providerId }],
			});

			const accountUserIds = accounts.map((account) => account.userId);
			let userFilters: DBFilter[] = [
				{ field: "id", value: accountUserIds, operator: "in" },
			];

			const organizationId = ctx.context.scimProvider.organizationId;
			if (organizationId) {
				const members = await ctx.context.adapter.findMany<Member>({
					model: "member",
					where: [
						{ field: "organizationId", value: organizationId },
						{ field: "userId", value: accountUserIds, operator: "in" },
					],
				});

				const memberUserIds = members.map((member) => member.userId);
				userFilters = [{ field: "id", value: memberUserIds, operator: "in" }];
			}

			const users = await ctx.context.adapter.findMany<User>({
				model: "user",
				where: [...userFilters, ...apiFilters],
			});

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
	);

export const getSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "GET",
			metadata: {
				isAction: false,
				allowedMediaTypes: supportedMediaTypes,
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
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const userId = ctx.params.userId;
			const providerId = ctx.context.scimProvider.providerId;
			const organizationId = ctx.context.scimProvider.organizationId;

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			return ctx.json(createUserResource(ctx.context.baseURL, user, account));
		},
	);

const patchSCIMUserBodySchema = z.object({
	schemas: z
		.array(z.string())
		.refine(
			(s) => s.includes("urn:ietf:params:scim:api:messages:2.0:PatchOp"),
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
});

export const patchSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "PATCH",
			body: patchSCIMUserBodySchema,
			metadata: {
				isAction: false,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Patch SCIM user",
					description: "Updates fields on a SCIM user record",
					responses: {
						"204": {
							description: "Patch update applied correctly",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const userId = ctx.params.userId;
			const organizationId = ctx.context.scimProvider.organizationId;
			const providerId = ctx.context.scimProvider.providerId;

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			const { user: userPatch, account: accountPatch } = buildUserPatch(
				user,
				ctx.body.Operations,
			);

			if (
				Object.keys(userPatch).length === 0 &&
				Object.keys(accountPatch).length === 0
			) {
				throw new SCIMAPIError("BAD_REQUEST", {
					detail: "No valid fields to update",
				});
			}

			await Promise.all([
				Object.keys(userPatch).length > 0
					? ctx.context.internalAdapter.updateUser(userId, {
							...userPatch,
							updatedAt: new Date(),
						})
					: Promise.resolve(),
				Object.keys(accountPatch).length > 0
					? ctx.context.internalAdapter.updateAccount(account.id, {
							...accountPatch,
							updatedAt: new Date(),
						})
					: Promise.resolve(),
			]);

			ctx.setStatus(204);
			return;
		},
	);

export const deleteSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "DELETE",
			metadata: {
				isAction: false,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Delete SCIM user",
					description:
						"Deletes (or deactivates) a user within the linked organization.",
					responses: {
						"204": {
							description: "Delete applied successfully",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const userId = ctx.params.userId;
			const providerId = ctx.context.scimProvider.providerId;
			const organizationId = ctx.context.scimProvider.organizationId;

			const { user } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			await ctx.context.internalAdapter.deleteUser(userId);

			ctx.setStatus(204);
			return;
		},
	);

export const getSCIMServiceProviderConfig = createAuthEndpoint(
	"/scim/v2/ServiceProviderConfig",
	{
		method: "GET",
		metadata: {
			isAction: false,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Configuration",
				description:
					"Standard SCIM metadata endpoint used by identity providers. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: ServiceProviderOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
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
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
			meta: {
				resourceType: "ServiceProviderConfig",
			},
		});
	},
);

export const getSCIMSchemas = createAuthEndpoint(
	"/scim/v2/Schemas",
	{
		method: "GET",
		metadata: {
			isAction: false,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Configuration Schemas",
				description:
					"Standard SCIM metadata endpoint used by identity providers to acquire information about supported schemas. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: SCIMSchemaOpenAPISchema,
								},
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
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
						location: getResourceURL(s.meta.location, ctx.context.baseURL),
					},
				};
			}),
		});
	},
);

export const getSCIMSchema = createAuthEndpoint(
	"/scim/v2/Schemas/:schemaId",
	{
		method: "GET",
		metadata: {
			isAction: false,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM a Service Provider Configuration Schema",
				description:
					"Standard SCIM metadata endpoint used by identity providers to acquire information about a given schema. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: SCIMSchemaOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const schema = supportedSCIMSchemas.find(
			(s) => s.id === ctx.params.schemaId,
		);

		if (!schema) {
			throw new SCIMAPIError("NOT_FOUND", {
				detail: "Schema not found",
			});
		}

		return ctx.json({
			...schema,
			meta: {
				...schema.meta,
				location: getResourceURL(schema.meta.location, ctx.context.baseURL),
			},
		});
	},
);

export const getSCIMResourceTypes = createAuthEndpoint(
	"/scim/v2/ResourceTypes",
	{
		method: "GET",
		metadata: {
			isAction: false,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Supported Resource Types",
				description:
					"Standard SCIM metadata endpoint used by identity providers to get a list of server supported types. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
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
											items: ResourceTypeOpenAPISchema,
										},
									},
								},
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
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
						location: getResourceURL(s.meta.location, ctx.context.baseURL),
					},
				};
			}),
		});
	},
);

export const getSCIMResourceType = createAuthEndpoint(
	"/scim/v2/ResourceTypes/:resourceTypeId",
	{
		method: "GET",
		metadata: {
			isAction: false,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Supported Resource Type",
				description:
					"Standard SCIM metadata endpoint used by identity providers to get a server supported type. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: ResourceTypeOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const resourceType = supportedSCIMResourceTypes.find(
			(s) => s.id === ctx.params.resourceTypeId,
		);

		if (!resourceType) {
			throw new SCIMAPIError("NOT_FOUND", {
				detail: "Resource type not found",
			});
		}

		return ctx.json({
			...resourceType,
			meta: {
				...resourceType.meta,
				location: getResourceURL(
					resourceType.meta.location,
					ctx.context.baseURL,
				),
			},
		});
	},
);

const findUserById = async (
	adapter: DBAdapter,
	{
		userId,
		providerId,
		organizationId,
	}: { userId: string; providerId: string; organizationId?: string },
) => {
	const account = await adapter.findOne<Account>({
		model: "account",
		where: [
			{ field: "userId", value: userId },
			{ field: "providerId", value: providerId },
		],
	});

	// Disallows access to the resource
	// Account is not associated to the provider

	if (!account) {
		return { user: null, account: null };
	}

	let member: Member | null = null;
	if (organizationId) {
		member = await adapter.findOne<Member>({
			model: "member",
			where: [
				{ field: "organizationId", value: organizationId },
				{ field: "userId", value: userId },
			],
		});
	}

	// Disallows access to the resource
	// Token is restricted to an org and the member is not part of it

	if (organizationId && !member) {
		return { user: null, account: null };
	}

	const user = await adapter.findOne<User>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});

	if (!user) {
		return { user: null, account: null };
	}

	return { user, account };
};

const parseSCIMAPIUserFilter = (filter?: string) => {
	let filters: DBFilter[] = [];

	try {
		filters = filter ? parseSCIMUserFilter(filter) : [];
	} catch (error) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail:
				error instanceof SCIMParseError ? error.message : "Invalid SCIM filter",
			scimType: "invalidFilter",
		});
	}

	return filters;
};
