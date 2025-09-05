import type { User } from "../../";
import type { Organization, Team } from "../organization";

// Core workspace entity types
export type Workspace = {
	id: string;
	name: string;
	slug?: string;
	description?: string;
	organizationId: string;
	metadata?: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
};

export type WorkspaceMember = {
	id: string;
	workspaceId: string;
	userId: string;
	role: string;
	createdAt: Date;
};

export type WorkspaceTeamMember = {
	id: string;
	workspaceId: string;
	teamId: string;
	role: string;
	createdAt: Date;
};

export interface WorkspaceOptions {
	/**
	 * Roles configuration for workspace members
	 */
	roles?: Record<string, unknown>;

	/**
	 * Schema configuration for additional fields
	 */
	schema?: {
		workspace?: {
			additionalFields?: Record<string, unknown>;
		};
		workspaceMember?: {
			additionalFields?: Record<string, unknown>;
		};
		workspaceTeamMember?: {
			additionalFields?: Record<string, unknown>;
		};
	};

	/**
	 * Hooks for workspace operations
	 */
	workspaceHooks?: {
		beforeCreateWorkspace?: (data: {
			workspace: Workspace;
			organization: Organization;
			user: User;
		}) => Promise<{ data?: Record<string, unknown> } | undefined>;

		afterCreateWorkspace?: (data: {
			workspace: Workspace;
			organization: Organization;
			user: User;
		}) => Promise<void>;

		beforeAddWorkspaceMember?: (data: {
			member: WorkspaceMember;
			workspace: Workspace;
			user: User;
		}) => Promise<{ data?: Record<string, unknown> } | undefined>;

		afterAddWorkspaceMember?: (data: {
			member: WorkspaceMember;
			workspace: Workspace;
			user: User;
		}) => Promise<void>;

		beforeRemoveWorkspaceMember?: (data: {
			member: WorkspaceMember;
			workspace: Workspace;
			user: User;
		}) => Promise<void>;

		afterRemoveWorkspaceMember?: (data: {
			member: WorkspaceMember;
			workspace: Workspace;
			user: User;
		}) => Promise<void>;

		beforeAddWorkspaceTeamMember?: (data: {
			teamMember: WorkspaceTeamMember;
			workspace: Workspace;
			team: Team;
			user: User;
		}) => Promise<{ data?: Record<string, unknown> } | undefined>;

		afterAddWorkspaceTeamMember?: (data: {
			teamMember: WorkspaceTeamMember;
			workspace: Workspace;
			team: Team;
			user: User;
		}) => Promise<void>;

		beforeRemoveWorkspaceTeamMember?: (data: {
			teamMember: WorkspaceTeamMember;
			workspace: Workspace;
			team: Team;
			user: User;
		}) => Promise<void>;

		afterRemoveWorkspaceTeamMember?: (data: {
			teamMember: WorkspaceTeamMember;
			workspace: Workspace;
			team: Team;
			user: User;
		}) => Promise<void>;
	};

	/**
	 * Whether to automatically create a default workspace for new organizations
	 */
	createDefaultWorkspace?: boolean;

	/**
	 * Default workspace name for new organizations
	 */
	defaultWorkspaceName?: string;
}
