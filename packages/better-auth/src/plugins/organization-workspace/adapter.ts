import type { AuthContext } from "../../";
import type {
	WorkspaceOptions,
	Workspace,
	WorkspaceMember,
	WorkspaceTeamMember,
} from "./types";

export interface WorkspaceAdapter {
	// Workspace CRUD operations
	createWorkspace(
		data: Omit<Workspace, "id" | "createdAt" | "updatedAt">,
	): Promise<Workspace>;
	findWorkspaceById(id: string): Promise<Workspace | null>;
	findWorkspaceBySlug(
		slug: string,
		organizationId: string,
	): Promise<Workspace | null>;
	updateWorkspace(id: string, data: Partial<Workspace>): Promise<Workspace>;
	deleteWorkspace(id: string): Promise<void>;
	listWorkspacesByOrganization(organizationId: string): Promise<Workspace[]>;
	listWorkspacesByUser(userId: string): Promise<Workspace[]>;

	// Workspace member operations
	addWorkspaceMember(
		data: Omit<WorkspaceMember, "id" | "createdAt">,
	): Promise<WorkspaceMember>;
	findWorkspaceMember(
		workspaceId: string,
		userId: string,
	): Promise<WorkspaceMember | null>;
	findWorkspaceMemberById(id: string): Promise<WorkspaceMember | null>;
	updateWorkspaceMemberRole(id: string, role: string): Promise<WorkspaceMember>;
	removeWorkspaceMember(id: string): Promise<void>;
	listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;

	// Workspace team member operations
	addWorkspaceTeamMember(
		data: Omit<WorkspaceTeamMember, "id" | "createdAt">,
	): Promise<WorkspaceTeamMember>;
	findWorkspaceTeamMember(
		workspaceId: string,
		teamId: string,
	): Promise<WorkspaceTeamMember | null>;
	findWorkspaceTeamMemberById(id: string): Promise<WorkspaceTeamMember | null>;
	updateWorkspaceTeamMemberRole(
		id: string,
		role: string,
	): Promise<WorkspaceTeamMember>;
	removeWorkspaceTeamMember(id: string): Promise<void>;
	listWorkspaceTeamMembers(workspaceId: string): Promise<WorkspaceTeamMember[]>;

	// Session operations
	setActiveWorkspace(
		sessionToken: string,
		workspaceId: string | null,
	): Promise<any>;
}

export function getWorkspaceAdapter(
	context: AuthContext,
	options?: WorkspaceOptions,
): WorkspaceAdapter {
	const adapter = context.adapter;

	return {
		async createWorkspace(data) {
			const workspace = await adapter.create({
				model: "workspace",
				data: {
					...data,
					metadata: data.metadata
						? JSON.stringify(data.metadata)
						: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			return {
				...workspace,
				metadata:
					workspace.metadata && typeof workspace.metadata === "string"
						? JSON.parse(workspace.metadata)
						: workspace.metadata,
			} as Workspace;
		},

		async findWorkspaceById(id) {
			const workspace = await adapter.findOne({
				model: "workspace",
				where: [{ field: "id", value: id }],
			});
			if (!workspace) return null;
			return {
				...workspace,
				metadata:
					(workspace as any).metadata && typeof (workspace as any).metadata === "string"
						? JSON.parse((workspace as any).metadata)
						: (workspace as any).metadata,
			} as Workspace;
		},

		async findWorkspaceBySlug(slug, organizationId) {
			const workspace = await adapter.findOne({
				model: "workspace",
				where: [
					{ field: "slug", value: slug },
					{ field: "organizationId", value: organizationId },
				],
			});
			if (!workspace) return null;
			return {
				...workspace,
				metadata:
					(workspace as any).metadata && typeof (workspace as any).metadata === "string"
						? JSON.parse((workspace as any).metadata)
						: (workspace as any).metadata,
			} as Workspace;
		},

		async updateWorkspace(id, data) {
			const workspace = await adapter.update({
				model: "workspace",
				where: [{ field: "id", value: id }],
				update: {
					...data,
					metadata: data.metadata
						? JSON.stringify(data.metadata)
						: data.metadata,
					updatedAt: new Date(),
				},
			});
			return {
				...(workspace as any),
				metadata:
					(workspace as any).metadata && typeof (workspace as any).metadata === "string"
						? JSON.parse((workspace as any).metadata)
						: (workspace as any).metadata,
			} as Workspace;
		},

		async deleteWorkspace(id) {
			await adapter.delete({
				model: "workspace",
				where: [{ field: "id", value: id }],
			});
		},

		async listWorkspacesByOrganization(organizationId) {
			const workspaces = await adapter.findMany({
				model: "workspace",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return workspaces.map((workspace: any) => ({
				...workspace,
				metadata:
					workspace.metadata && typeof workspace.metadata === "string"
						? JSON.parse(workspace.metadata)
						: workspace.metadata,
			})) as Workspace[];
		},

		async listWorkspacesByUser(userId) {
			// Get all workspace memberships for the user
			const memberships = await adapter.findMany({
				model: "workspaceMember",
				where: [{ field: "userId", value: userId }],
			});

			if (!memberships.length) return [];

			// Get all workspaces for those memberships
			const workspaceIds = (memberships as Array<{ workspaceId: string }>).map(
				(m) => m.workspaceId,
			);
			const workspaces = await adapter.findMany({
				model: "workspace",
				where: workspaceIds.map((id) => ({ field: "id", value: id })),
			});

			return workspaces.map((workspace: any) => ({
				...workspace,
				metadata:
					workspace.metadata && typeof workspace.metadata === "string"
						? JSON.parse(workspace.metadata)
						: workspace.metadata,
			})) as Workspace[];
		},

		async addWorkspaceMember(data) {
			const member = await adapter.create({
				model: "workspaceMember",
				data: {
					...data,
					createdAt: new Date(),
				},
			});
			return member as WorkspaceMember;
		},

		async findWorkspaceMember(workspaceId, userId) {
			const member = await adapter.findOne({
				model: "workspaceMember",
				where: [
					{ field: "workspaceId", value: workspaceId },
					{ field: "userId", value: userId },
				],
			});
			return member as WorkspaceMember | null;
		},

		async findWorkspaceMemberById(id) {
			const member = await adapter.findOne({
				model: "workspaceMember",
				where: [{ field: "id", value: id }],
			});
			return member as WorkspaceMember | null;
		},

		async updateWorkspaceMemberRole(id, role) {
			const member = await adapter.update({
				model: "workspaceMember",
				where: [{ field: "id", value: id }],
				update: { role },
			});
			return member as WorkspaceMember;
		},

		async removeWorkspaceMember(id) {
			await adapter.delete({
				model: "workspaceMember",
				where: [{ field: "id", value: id }],
			});
		},

		async listWorkspaceMembers(workspaceId) {
			const members = await adapter.findMany({
				model: "workspaceMember",
				where: [{ field: "workspaceId", value: workspaceId }],
			});
			return members as WorkspaceMember[];
		},

		// Team member methods
		async addWorkspaceTeamMember(data) {
			const teamMember = await adapter.create({
				model: "workspaceTeamMember",
				data: {
					...data,
					createdAt: new Date(),
				},
			});
			return teamMember as WorkspaceTeamMember;
		},

		async findWorkspaceTeamMember(workspaceId, teamId) {
			const teamMember = await adapter.findOne({
				model: "workspaceTeamMember",
				where: [
					{ field: "workspaceId", value: workspaceId },
					{ field: "teamId", value: teamId },
				],
			});
			return teamMember as WorkspaceTeamMember | null;
		},

		async findWorkspaceTeamMemberById(id) {
			const teamMember = await adapter.findOne({
				model: "workspaceTeamMember",
				where: [{ field: "id", value: id }],
			});
			return teamMember as WorkspaceTeamMember | null;
		},

		async updateWorkspaceTeamMemberRole(id, role) {
			const teamMember = await adapter.update({
				model: "workspaceTeamMember",
				where: [{ field: "id", value: id }],
				update: { role },
			});
			return teamMember as WorkspaceTeamMember;
		},

		async removeWorkspaceTeamMember(id) {
			await adapter.delete({
				model: "workspaceTeamMember",
				where: [{ field: "id", value: id }],
			});
		},

		async listWorkspaceTeamMembers(workspaceId) {
			const teamMembers = await adapter.findMany({
				model: "workspaceTeamMember",
				where: [{ field: "workspaceId", value: workspaceId }],
			});
			return teamMembers as WorkspaceTeamMember[];
		},

		async setActiveWorkspace(sessionToken, workspaceId) {
			return await adapter.update({
				model: "session",
				where: [{ field: "token", value: sessionToken }],
				update: { activeWorkspaceId: workspaceId },
			});
		},
	};
}
