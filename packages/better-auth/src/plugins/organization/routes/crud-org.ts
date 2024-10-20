import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { generateId } from "../../../utils/id";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { APIError } from "better-call";

export const createOrganization = createAuthEndpoint(
	"/organization/create",
	{
		method: "POST",
		body: z.object({
			name: z.string(),
			slug: z.string(),
			userId: z.string().optional(),
			logo: z.string().optional(),
			metadata: z.record(z.string()).optional(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const user = ctx.context.session.user;
		if (!user) {
			return ctx.json(null, {
				status: 401,
			});
		}
		const options = ctx.context.orgOptions;
		const canCreateOrg =
			typeof options?.allowUserToCreateOrganization === "function"
				? await options.allowUserToCreateOrganization(user)
				: options?.allowUserToCreateOrganization === undefined
					? true
					: options.allowUserToCreateOrganization;

		if (!canCreateOrg) {
			throw new APIError("FORBIDDEN", {
				message: "You are not allowed to create an organization",
			});
		}
		const adapter = getOrgAdapter(ctx.context, options);

		const userOrganizations = await adapter.listOrganizations(user.id);
		const hasReachedOrgLimit =
			typeof options.organizationLimit === "number"
				? userOrganizations.length >= options.organizationLimit
				: typeof options.organizationLimit === "function"
					? await options.organizationLimit(user)
					: false;

		if (hasReachedOrgLimit) {
			throw new APIError("FORBIDDEN", {
				message: "You have reached the organization limit",
			});
		}

		const existingOrganization = await adapter.findOrganizationBySlug(
			ctx.body.slug,
		);
		if (existingOrganization) {
			throw new APIError("BAD_REQUEST", {
				message: "Organization with this slug already exists",
			});
		}
		const organization = await adapter.createOrganization({
			organization: {
				id: generateId(),
				slug: ctx.body.slug,
				name: ctx.body.name,
				logo: ctx.body.logo,
				createdAt: new Date(),
				metadata: ctx.body.metadata,
			},
			user,
		});
		return ctx.json(organization);
	},
);

export const updateOrganization = createAuthEndpoint(
	"/organization/update",
	{
		method: "POST",
		body: z.object({
			data: z
				.object({
					name: z.string().optional(),
					slug: z.string().optional(),
				})
				.partial(),
			orgId: z.string().optional(),
		}),
		requireHeaders: true,
		use: [orgMiddleware],
	},
	async (ctx) => {
		const session = await ctx.context.getSession(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				message: "User not found",
			});
		}
		const orgId = ctx.body.orgId || session.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Organization id not found!",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: orgId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User is not a member of this organization!",
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
		const canUpdateOrg = role.authorize({
			organization: ["update"],
		});
		if (canUpdateOrg.error) {
			return ctx.json(null, {
				body: {
					message: "You are not allowed to update this organization",
				},
				status: 403,
			});
		}
		const updatedOrg = await adapter.updateOrganization(orgId, ctx.body.data);
		return ctx.json(updatedOrg);
	},
);

export const deleteOrganization = createAuthEndpoint(
	"/organization/delete",
	{
		method: "POST",
		body: z.object({
			orgId: z.string(),
		}),
		requireHeaders: true,
		use: [orgMiddleware],
	},
	async (ctx) => {
		const session = await ctx.context.getSession(ctx);
		if (!session) {
			return ctx.json(null, {
				status: 401,
			});
		}
		const orgId = ctx.body.orgId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Organization id not found!",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: orgId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User is not a member of this organization!",
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
		const canDeleteOrg = role.authorize({
			organization: ["delete"],
		});
		if (canDeleteOrg.error) {
			throw new APIError("FORBIDDEN", {
				message: "You are not allowed to delete this organization",
			});
		}
		if (orgId === session.session.activeOrganizationId) {
			/**
			 * If the organization is deleted, we set the active organization to null
			 */
			await adapter.setActiveOrganization(session.session.id, null);
		}
		await adapter.deleteOrganization(orgId);
		return ctx.json(orgId);
	},
);

export const getFullOrganization = createAuthEndpoint(
	"/organization/get-full",
	{
		method: "GET",
		query: z.object({
			orgId: z.string().optional(),
		}),
		requireHeaders: true,
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const orgId = ctx.query.orgId || session.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const organization = await adapter.findFullOrganization(
			orgId,
			ctx.context.db || undefined,
		);
		if (!organization) {
			throw new APIError("BAD_REQUEST", {
				message: "Organization not found",
			});
		}
		return ctx.json(organization);
	},
);

export const setActiveOrganization = createAuthEndpoint(
	"/organization/activate",
	{
		method: "POST",
		body: z.object({
			orgId: z.string().nullable().optional(),
		}),
		use: [orgSessionMiddleware, orgMiddleware],
	},
	async (ctx) => {
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const session = ctx.context.session;
		let orgId = ctx.body.orgId;
		if (orgId === null) {
			const sessionOrgId = session.session.activeOrganizationId;
			if (!sessionOrgId) {
				return ctx.json(null);
			}
			await adapter.setActiveOrganization(session.session.id, null);
			return ctx.json(null);
		}
		if (!orgId) {
			const sessionOrgId = session.session.activeOrganizationId;
			if (!sessionOrgId) {
				return ctx.json(null);
			}
			orgId = sessionOrgId;
		}
		const isMember = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: orgId,
		});
		if (!isMember) {
			await adapter.setActiveOrganization(session.session.id, null);
			throw new APIError("FORBIDDEN", {
				message: "You are not a member of this organization",
			});
		}
		await adapter.setActiveOrganization(session.session.id, orgId);
		const organization = await adapter.findFullOrganization(
			orgId,
			ctx.context.db || undefined,
		);
		return ctx.json(organization);
	},
);

export const listOrganization = createAuthEndpoint(
	"/organization/list",
	{
		method: "GET",
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const organizations = await adapter.listOrganizations(
			ctx.context.session.user.id,
		);
		return ctx.json(organizations);
	},
);
