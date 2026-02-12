import type { AuthContext } from "@better-auth/core";
import { generateRandomString } from "../../crypto";
import type { User } from "../../types";

export function createSaveUser(ctx: AuthContext) {
	return async (user: User): Promise<User> => {
		return ctx.internalAdapter.createUser(user);
	};
}

export function createDeleteUser(ctx: AuthContext) {
	return async (userId: string): Promise<void> => {
		await ctx.internalAdapter.deleteUser(userId);
	};
}

export function createSaveOrganization(ctx: AuthContext) {
	return async (
		org: Record<string, unknown>,
	): Promise<Record<string, unknown>> => {
		const result = await ctx.adapter.create({
			model: "organization",
			data: org,
			forceAllowId: true,
		});
		return result;
	};
}

export function createDeleteOrganization(ctx: AuthContext) {
	return async (orgId: string): Promise<void> => {
		// First delete all members
		await ctx.adapter.deleteMany({
			model: "member",
			where: [{ field: "organizationId", value: orgId }],
		});

		// Then delete all invitations
		await ctx.adapter.deleteMany({
			model: "invitation",
			where: [{ field: "organizationId", value: orgId }],
		});

		// Finally delete the organization
		await ctx.adapter.delete({
			model: "organization",
			where: [{ field: "id", value: orgId }],
		});
	};
}

export function createAddMember(ctx: AuthContext) {
	return async (opts: {
		userId: string;
		organizationId: string;
		role?: string;
	}): Promise<Record<string, unknown>> => {
		const generatedId = ctx.generateId({ model: "member" });
		const id =
			generatedId === false
				? generateRandomString(24, "a-z", "A-Z", "0-9")
				: generatedId;

		const result = await ctx.adapter.create({
			model: "member",
			data: {
				id,
				userId: opts.userId,
				organizationId: opts.organizationId,
				role: opts.role || "member",
				createdAt: new Date(),
			},
			forceAllowId: true,
		});
		return result;
	};
}
