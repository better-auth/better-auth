import type { AppInviteOptions } from ".";
import type { AuthContext, User, Where } from "../../types";
import { getDate } from "../../utils/date";
import { type AppInvitationInput, type AppInvitation } from "./schema";

export const getAppInviteAdapter = (
	context: AuthContext,
	options?: AppInviteOptions,
) => {
	const adapter = context.adapter;
	return {
		createInvitation: async ({
			invitation,
			user,
		}: {
			invitation: {
				name?: string;
				email?: string;
				domainWhitelist?: string;
			};
			user: User;
		}) => {
			const defaultExpiration = 1000 * 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
			);
			const invite = await adapter.create<AppInvitationInput, AppInvitation>({
				model: "appInvitation",
				data: {
					name: !!invitation.email ? invitation.name : undefined,
					email: invitation.email,
					status: "pending",
					expiresAt,
					inviterId: user.id,
					domainWhitelist: !invitation.email
						? invitation.domainWhitelist
						: undefined,
				},
			});

			return invite;
		},
		findInvitationById: async (id: string) => {
			const invitation = await adapter.findOne<AppInvitation>({
				model: "appInvitation",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			return invitation;
		},
		findPendingInvitation: async (data: { email: string }) => {
			const invitation = await adapter.findOne<AppInvitation>({
				model: "appInvitation",
				where: [
					{
						field: "email",
						value: data.email,
					},
					{
						field: "status",
						value: "pending",
					},
				],
			});

			if (invitation && new Date(invitation.expiresAt) > new Date()) {
				return invitation;
			}

			return undefined;
		},
		listInvitationsByIssuer: async (
			inviterId: string,
			limit?: number,
			offset?: number,
			sortBy?: {
				field: string;
				direction: "asc" | "desc";
			},
			where?: Where[],
		) => {
			const invitations = await adapter.findMany<AppInvitation>({
				model: "appInvitation",
				where: [
					...(where || []),
					{
						field: "inviterId",
						operator: "eq",
						value: inviterId,
					},
				],
				limit,
				offset,
				sortBy,
			});

			return invitations;
		},
		updateInvitation: async (data: {
			invitationId: string;
			status: "accepted" | "canceled" | "rejected";
		}) => {
			const invitation = await adapter.update<AppInvitation>({
				model: "appInvitation",
				where: [
					{
						field: "id",
						value: data.invitationId,
					},
				],
				update: {
					status: data.status,
				},
			});
			return invitation;
		},
	};
};
