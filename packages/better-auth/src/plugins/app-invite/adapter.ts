import type { AppInviteOptions } from ".";
import type { AuthContext, User } from "../../types";
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
					email: invitation.email,
					status: "pending",
					expiresAt,
					inviterId: user.id,
					domainWhitelist: invitation.domainWhitelist
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
