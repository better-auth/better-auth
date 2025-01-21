import type { Session, User } from "../../types";
import { getDate } from "../../utils/date";
import type { SwarmOptions } from "./swarm";
import type {
	Invitation,
	InvitationInput,
	Member,
	MemberInput,
	Swarm,
	SwarmInput,
} from "./schema";
import { BetterAuthError } from "../../error";
import type { AuthContext } from "../../types";
import parseJSON from "../../client/parser";

export const getSwmAdapter = (
	context: AuthContext,
	options?: SwarmOptions,
) => {
	const adapter = context.adapter;
	return {
		findSwarmBySlug: async (slug: string) => {
			const swarm = await adapter.findOne<Swarm>({
				model: "swarm",
				where: [
					{
						field: "slug",
						value: slug,
					},
				],
			});
			return swarm;
		},
		createSwarm: async (data: {
			swarm: SwarmInput;
			user: User;
		}) => {
			const swarm = await adapter.create<
				SwarmInput,
				Swarm
			>({
				model: "swarm",
				data: {
					...data.swarm,
					metadata: data.swarm.metadata
						? JSON.stringify(data.swarm.metadata)
						: undefined,
				},
			});
			const member = await adapter.create<MemberInput>({
				model: "member",
				data: {
					swarmId: swarm.id,
					userId: data.user.id,
					createdAt: new Date(),
					role: options?.creatorRole || "owner",
				},
			});
			return {
				...swarm,
				metadata: swarm.metadata
					? JSON.parse(swarm.metadata)
					: undefined,
				members: [
					{
						...member,
						user: {
							id: data.user.id,
							name: data.user.name,
							email: data.user.email,
							image: data.user.image,
						},
					},
				],
			};
		},
		findMemberByEmail: async (data: {
			email: string;
			swarmId: string;
		}) => {
			const user = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: data.email,
					},
				],
			});
			if (!user) {
				return null;
			}
			const member = await adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "swarmId",
						value: data.swarmId,
					},
					{
						field: "userId",
						value: user.id,
					},
				],
			});
			if (!member) {
				return null;
			}
			return {
				...member,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		findMemberBySwmId: async (data: {
			userId: string;
			swarmId: string;
		}) => {
			const [member, user] = await Promise.all([
				await adapter.findOne<Member>({
					model: "member",
					where: [
						{
							field: "userId",
							value: data.userId,
						},
						{
							field: "swarmId",
							value: data.swarmId,
						},
					],
				}),
				await adapter.findOne<User>({
					model: "user",
					where: [
						{
							field: "id",
							value: data.userId,
						},
					],
				}),
			]);
			if (!user || !member) {
				return null;
			}
			return {
				...member,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		findMemberById: async (memberId: string) => {
			const member = await adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
			});
			if (!member) {
				return null;
			}
			const user = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: member.userId,
					},
				],
			});
			if (!user) {
				return null;
			}
			return {
				...member,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		createMember: async (data: MemberInput) => {
			const member = await adapter.create<MemberInput>({
				model: "member",
				data: data,
			});
			return member;
		},
		updateMember: async (memberId: string, role: string) => {
			const member = await adapter.update<Member>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
				update: {
					role,
				},
			});
			return member;
		},
		deleteMember: async (memberId: string) => {
			const member = await adapter.delete<Member>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
			});
			return member;
		},
		updateSwarm: async (
			swarmId: string,
			data: Partial<Swarm>,
		) => {
			const swarm = await adapter.update<Swarm>({
				model: "swarm",
				where: [
					{
						field: "id",
						value: swarmId,
					},
				],
				update: {
					...data,
					metadata:
						typeof data.metadata === "object"
							? JSON.stringify(data.metadata)
							: data.metadata,
				},
			});
			if (!swarm) {
				return null;
			}
			return {
				...swarm,
				metadata: swarm.metadata
					? parseJSON<Record<string, any>>(swarm.metadata)
					: undefined,
			};
		},
		deleteSwarm: async (swarmId: string) => {
			await adapter.delete({
				model: "member",
				where: [
					{
						field: "swarmId",
						value: swarmId,
					},
				],
			});
			await adapter.delete({
				model: "invitation",
				where: [
					{
						field: "swarmId",
						value: swarmId,
					},
				],
			});
			await adapter.delete<Swarm>({
				model: "swarm",
				where: [
					{
						field: "id",
						value: swarmId,
					},
				],
			});
			return swarmId;
		},
		setActiveSwarm: async (
			sessionToken: string,
			swarmId: string | null,
		) => {
			const session = await context.internalAdapter.updateSession(
				sessionToken,
				{
					activeSwarmId: swarmId,
				},
			);
			return session as Session;
		},
		findSwarmById: async (swarmId: string) => {
			const swarm = await adapter.findOne<Swarm>({
				model: "swarm",
				where: [
					{
						field: "id",
						value: swarmId,
					},
				],
			});
			return swarm;
		},
		/**
		 * @requires db
		 */
		findFullSwarm: async ({
			swarmId,
			isSlug,
		}: {
			swarmId: string;
			isSlug?: boolean;
		}) => {
			const swm = await adapter.findOne<Swarm>({
				model: "swarm",
				where: [{ field: isSlug ? "slug" : "id", value: swarmId }],
			});
			if (!swm) {
				return null;
			}
			const [invitations, members] = await Promise.all([
				adapter.findMany<Invitation>({
					model: "invitation",
					where: [{ field: "swarmId", value: swm.id }],
				}),
				adapter.findMany<Member>({
					model: "member",
					where: [{ field: "swarmId", value: swm.id }],
				}),
			]);

			if (!swm) return null;

			const userIds = members.map((member) => member.userId);
			const users = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "id", value: userIds, operator: "in" }],
			});

			const userMap = new Map(users.map((user) => [user.id, user]));
			const membersWithUsers = members.map((member) => {
				const user = userMap.get(member.userId);
				if (!user) {
					throw new BetterAuthError(
						"Unexpected error: User not found for member",
					);
				}
				return {
					...member,
					user: {
						id: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
					},
				};
			});

			return {
				...swm,
				invitations,
				members: membersWithUsers,
			};
		},
		listSwarms: async (userId: string) => {
			const members = await adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			if (!members || members.length === 0) {
				return [];
			}

			const swarmIds = members.map((member) => member.swarmId);

			const swarms = await adapter.findMany<Swarm>({
				model: "swarm",
				where: [
					{
						field: "id",
						value: swarmIds,
						operator: "in",
					},
				],
			});
			return swarms;
		},
		createInvitation: async ({
			invitation,
			user,
		}: {
			invitation: {
				email: string;
				role: string;
				swarmId: string;
			};
			user: User;
		}) => {
			const defaultExpiration = 1000 * 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
			);
			const invite = await adapter.create<InvitationInput, Invitation>({
				model: "invitation",
				data: {
					email: invitation.email,
					role: invitation.role,
					swarmId: invitation.swarmId,
					status: "pending",
					expiresAt,
					inviterId: user.id,
				},
			});

			return invite;
		},
		findInvitationById: async (id: string) => {
			const invitation = await adapter.findOne<Invitation>({
				model: "invitation",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			return invitation;
		},
		findPendingInvitation: async (data: {
			email: string;
			swarmId: string;
		}) => {
			const invitation = await adapter.findMany<Invitation>({
				model: "invitation",
				where: [
					{
						field: "email",
						value: data.email,
					},
					{
						field: "swarmId",
						value: data.swarmId,
					},
					{
						field: "status",
						value: "pending",
					},
				],
			});
			return invitation.filter(
				(invite) => new Date(invite.expiresAt) > new Date(),
			);
		},
		updateInvitation: async (data: {
			invitationId: string;
			status: "accepted" | "canceled" | "rejected";
		}) => {
			const invitation = await adapter.update<Invitation>({
				model: "invitation",
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
