import { z } from "zod";
import { createOrgEndpoint } from "../call";
import { User } from "../../../adapters/schema";
import { getSession } from "../../../api/routes";
import { getOrgAdapter } from "../adapter";
import { generateId } from "../../../utils/id";

export const createOrganization = createOrgEndpoint(
	"/organization/create",
	{
		method: "POST",
		body: z.object({
			name: z.string(),
			slug: z.string(),
			userId: z.string().optional(),
		}),
	},
	async (ctx) => {
		let user: User | null = null;
		if (!ctx.request?.headers) {
			if (!ctx.body.userId) {
				return ctx.json(null);
			}
			user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
			if (!user) {
				return ctx.json(null);
			}
		} else {
			const session = await getSession({
				headers: ctx.request.headers,
			});
			if (!session) {
				return ctx.json(null, {
					status: 401,
				});
			}
			user = session.user;
		}
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
			return ctx.json(null, {
				status: 403,
				body: {
					message: "You are not allowed to create organizations",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context.adapter, options);
		const organization = await adapter.createOrganization({
			organization: {
				id: generateId(),
				slug: ctx.body.slug,
				name: ctx.body.name,
			},
			user,
		});
		return ctx.json(organization);
	},
);
