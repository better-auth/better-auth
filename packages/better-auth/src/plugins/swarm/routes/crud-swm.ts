import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { generateId } from "../../../utils/id";
import { getSwmAdapter } from "../adapter";
import { swmMiddleware, swmSessionMiddleware } from "../call";
import { APIError } from "better-call";
import { setSessionCookie } from "../../../cookies";
import { SWARM_ERROR_CODES } from "../error-codes";
import { getSessionFromCtx } from "../../../api";

export const createSwarm = createAuthEndpoint(
	"/swarm/create",
	{
		method: "POST",
		body: z.object({
			name: z.string({
				description: "The name of the swarm",
			}),
			slug: z.string({
				description: "The slug of the swarm",
			}),
			userId: z
				.string({
					description:
						"The user id of the swarm creator. If not provided, the current user will be used. Should only be used by admins or when called by the server.",
				})
				.optional(),
			logo: z
				.string({
					description: "The logo of the swarm",
				})
				.optional(),
			metadata: z
				.record(z.string(), z.any(), {
					description: "The metadata of the swarm",
				})
				.optional(),
		}),
		use: [swmMiddleware],
		metadata: {
			openapi: {
				description: "Create an swarm",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									description: "The swarm that was created",
									$ref: "#/components/schemas/Swarm",
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session && (ctx.request || ctx.headers)) {
			throw new APIError("UNAUTHORIZED");
		}
		let user = session?.user || null;
		if (!user) {
			if (!ctx.body.userId) {
				throw new APIError("UNAUTHORIZED");
			}
			user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
		}
		if (!user) {
			return ctx.json(null, {
				status: 401,
			});
		}
		const options = ctx.context.swmOptions;
		const canCreateSwm =
			typeof options?.allowUserToCreateSwarm === "function"
				? await options.allowUserToCreateSwarm(user)
				: options?.allowUserToCreateSwarm === undefined
					? true
					: options.allowUserToCreateSwarm;

		if (!canCreateSwm) {
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_SWARM,
			});
		}
		const adapter = getSwmAdapter(ctx.context, options);

		const userSwarms = await adapter.listSwarms(user.id);
		const hasReachedSwmLimit =
			typeof options.swarmLimit === "number"
				? userSwarms.length >= options.swarmLimit
				: typeof options.swarmLimit === "function"
					? await options.swarmLimit(user)
					: false;

		if (hasReachedSwmLimit) {
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_SWARMS,
			});
		}

		const existingSwarm = await adapter.findSwarmBySlug(
			ctx.body.slug,
		);
		if (existingSwarm) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.SWARM_ALREADY_EXISTS,
			});
		}
		const swarm = await adapter.createSwarm({
			swarm: {
				id: generateId(),
				slug: ctx.body.slug,
				name: ctx.body.name,
				logo: ctx.body.logo,
				createdAt: new Date(),
				metadata: ctx.body.metadata,
			},
			user,
		});
		if (ctx.context.session) {
			await adapter.setActiveSwarm(
				ctx.context.session.session.token,
				swarm.id,
			);
		}
		return ctx.json(swarm);
	},
);

export const updateSwarm = createAuthEndpoint(
	"/swarm/update",
	{
		method: "POST",
		body: z.object({
			data: z
				.object({
					name: z
						.string({
							description: "The name of the swarm",
						})
						.optional(),
					slug: z
						.string({
							description: "The slug of the swarm",
						})
						.optional(),
					logo: z
						.string({
							description: "The logo of the swarm",
						})
						.optional(),
					metadata: z
						.record(z.string(), z.any(), {
							description: "The metadata of the swarm",
						})
						.optional(),
				})
				.partial(),
			swarmId: z.string().optional(),
		}),
		requireHeaders: true,
		use: [swmMiddleware],
		metadata: {
			openapi: {
				description: "Update an swarm",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									description: "The updated swarm",
									$ref: "#/components/schemas/Swarm",
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const session = await ctx.context.getSession(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				message: "User not found",
			});
		}
		const swarmId =
			ctx.body.swarmId || session.session.activeSwarmId;
		if (!swarmId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
				},
			});
		}
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const member = await adapter.findMemberBySwmId({
			userId: session.user.id,
			swarmId: swarmId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message:
						SWARM_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_SWARM,
				},
			});
		}
		const role = ctx.context.roles[member.role];
		if (!role) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Role not found!",
				},
			});
		}
		const canUpdateSwm = role.authorize({
			swarm: ["update"],
		});
		if (canUpdateSwm.error) {
			return ctx.json(null, {
				body: {
					message:
						SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_SWARM,
				},
				status: 403,
			});
		}
		const updatedSwm = await adapter.updateSwarm(
			swarmId,
			ctx.body.data,
		);
		return ctx.json(updatedSwm);
	},
);

export const deleteSwarm = createAuthEndpoint(
	"/swarm/delete",
	{
		method: "POST",
		body: z.object({
			swarmId: z.string({
				description: "The swarm id to delete",
			}),
		}),
		requireHeaders: true,
		use: [swmMiddleware],
		metadata: {
			openapi: {
				description: "Delete an swarm",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "string",
									description: "The swarm id that was deleted",
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const session = await ctx.context.getSession(ctx);
		if (!session) {
			return ctx.json(null, {
				status: 401,
			});
		}
		const swarmId = ctx.body.swarmId;
		if (!swarmId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
				},
			});
		}
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const member = await adapter.findMemberBySwmId({
			userId: session.user.id,
			swarmId: swarmId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message:
						SWARM_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_SWARM,
				},
			});
		}
		const role = ctx.context.roles[member.role];
		if (!role) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Role not found!",
				},
			});
		}
		const canDeleteSwm = role.authorize({
			swarm: ["delete"],
		});
		if (canDeleteSwm.error) {
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_SWARM,
			});
		}
		if (swarmId === session.session.activeSwarmId) {
			/**
			 * If the swarm is deleted, we set the active swarm to null
			 */
			await adapter.setActiveSwarm(session.session.token, null);
		}
		const option = ctx.context.swmOptions.swarmDeletion;
		if (option?.disabled) {
			throw new APIError("FORBIDDEN");
		}
		const swm = await adapter.findSwarmById(swarmId);
		if (!swm) {
			throw new APIError("BAD_REQUEST");
		}
		if (option?.beforeDelete) {
			await option.beforeDelete({
				swarm: swm,
				user: session.user,
			});
		}
		await adapter.deleteSwarm(swarmId);
		if (option?.afterDelete) {
			await option.afterDelete({
				swarm: swm,
				user: session.user,
			});
		}
		return ctx.json(swm);
	},
);

export const getFullSwarm = createAuthEndpoint(
	"/swarm/get-full-swarm",
	{
		method: "GET",
		query: z.optional(
			z.object({
				swarmId: z
					.string({
						description: "The swarm id to get",
					})
					.optional(),
				swarmSlug: z
					.string({
						description: "The swarm slug to get",
					})
					.optional(),
			}),
		),
		requireHeaders: true,
		use: [swmMiddleware, swmSessionMiddleware],
		metadata: {
			openapi: {
				description: "Get the full swarm",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									description: "The swarm",
									$ref: "#/components/schemas/Swarm",
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const session = ctx.context.session;
		const swarmId =
			ctx.query?.swarmSlug ||
			ctx.query?.swarmId ||
			session.session.activeSwarmId;
		if (!swarmId) {
			return ctx.json(null, {
				status: 200,
			});
		}
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const swarm = await adapter.findFullSwarm({
			swarmId,
			isSlug: !!ctx.query?.swarmSlug,
		});
		const isMember = swarm?.members.find(
			(member) => member.userId === session.user.id,
		);
		if (!isMember) {
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_SWARM,
			});
		}
		if (!swarm) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
			});
		}
		return ctx.json(swarm);
	},
);

export const setActiveSwarm = createAuthEndpoint(
	"/swarm/set-active",
	{
		method: "POST",
		body: z.object({
			swarmId: z
				.string({
					description:
						"The swarm id to set as active. It can be null to unset the active swarm",
				})
				.nullable()
				.optional(),
			swarmSlug: z
				.string({
					description:
						"The swarm slug to set as active. It can be null to unset the active swarm if swarmId is not provided",
				})
				.optional(),
		}),
		use: [swmSessionMiddleware, swmMiddleware],
		metadata: {
			openapi: {
				description: "Set the active swarm",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									description: "The swarm",
									$ref: "#/components/schemas/Swarm",
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const session = ctx.context.session;
		let swarmId = ctx.body.swarmSlug || ctx.body.swarmId;
		if (swarmId === null) {
			const sessionSwmId = session.session.activeSwarmId;
			if (!sessionSwmId) {
				return ctx.json(null);
			}
			const updatedSession = await adapter.setActiveSwarm(
				session.session.token,
				null,
			);
			await setSessionCookie(ctx, {
				session: updatedSession,
				user: session.user,
			});
			return ctx.json(null);
		}
		if (!swarmId) {
			const sessionSwmId = session.session.activeSwarmId;
			if (!sessionSwmId) {
				return ctx.json(null);
			}
			swarmId = sessionSwmId;
		}
		const swarm = await adapter.findFullSwarm({
			swarmId,
			isSlug: !!ctx.body.swarmSlug,
		});
		const isMember = swarm?.members.find(
			(member) => member.userId === session.user.id,
		);
		if (!isMember) {
			await adapter.setActiveSwarm(session.session.token, null);
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_SWARM,
			});
		}
		if (!swarm) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
			});
		}
		const updatedSession = await adapter.setActiveSwarm(
			session.session.token,
			swarm.id,
		);
		await setSessionCookie(ctx, {
			session: updatedSession,
			user: session.user,
		});
		return ctx.json(swarm);
	},
);

export const listSwarms = createAuthEndpoint(
	"/swarm/list",
	{
		method: "GET",
		use: [swmMiddleware, swmSessionMiddleware],
		metadata: {
			openapi: {
				description: "List all swarms",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: {
										$ref: "#/components/schemas/Swarm",
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const swarms = await adapter.listSwarms(
			ctx.context.session.user.id,
		);
		return ctx.json(swarms);
	},
);
