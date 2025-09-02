import type { BetterAuthClientPlugin } from "../../../client";
import type { workspace } from "../index";

interface WorkspaceClientOptions {
	ac?: unknown;
	roles?: {
		[key in string]: unknown;
	};
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
}

interface FetchFunction {
	(
		url: string,
		options?: {
			method?: string;
			body?: unknown;
			[key: string]: unknown;
		},
	): Promise<unknown>;
}

interface FetchOptions {
	method?: string;
	body?: unknown;
	[key: string]: unknown;
}

export const workspaceClient = (
	options?: WorkspaceClientOptions,
): BetterAuthClientPlugin => {
	return {
		id: "workspace",
		pathMethods: {
			"/workspace/create": "POST",
			"/workspace/get": "POST",
			"/workspace/update": "POST",
			"/workspace/delete": "POST",
			"/workspace/list": "GET",
			"/workspace/set-active": "POST",
			"/workspace/add-member": "POST",
			"/workspace/remove-member": "POST",
			"/workspace/update-member-role": "POST",
			"/workspace/list-members": "GET",
			"/workspace/add-team-member": "POST",
			"/workspace/remove-team-member": "POST",
			"/workspace/update-team-member-role": "POST",
			"/workspace/list-team-members": "GET",
		},
		$InferServerPlugin: {} as ReturnType<typeof workspace>,
		getActions: ($fetch: FetchFunction) => ({
			workspace: {
				create: async (
					data: {
						name: string;
						slug?: string;
						description?: string;
						organizationId?: string;
						metadata?: Record<string, any>;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/create", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				get: async (
					data: {
						workspaceId: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/get", {
						method: "GET",
						query: data,
						...fetchOptions,
					});
				},
				update: async (
					data: {
						workspaceId: string;
						name?: string;
						description?: string;
						slug?: string;
						metadata?: Record<string, any>;
					},
					fetchOptions?: FetchOptions,
				) => {
					const { workspaceId, ...updateData } = data;
					return await $fetch("/workspace/update", {
						method: "POST",
						body: {
							workspaceId,
							data: updateData,
						},
						...fetchOptions,
					});
				},
				delete: async (
					data: {
						workspaceId: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/delete", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				list: async (
					data?: {
						organizationId?: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					const params = new URLSearchParams();
					if (data?.organizationId) {
						params.append("organizationId", data.organizationId);
					}

					const url = `/workspace/list${params.toString() ? `?${params.toString()}` : ""}`;
					return await $fetch(url, {
						method: "GET",
						...fetchOptions,
					});
				},
				setActive: async (
					data: {
						workspaceId: string | null;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/set-active", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				addMember: async (
					data: {
						workspaceId: string;
						userId: string;
						role: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/add-member", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				removeMember: async (
					data: {
						workspaceId: string;
						userId: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/remove-member", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				updateMemberRole: async (
					data: {
						workspaceId: string;
						userId: string;
						role: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/update-member-role", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				listMembers: async (
					data: {
						workspaceId: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					const params = new URLSearchParams();
					if (data.workspaceId) {
						params.append("workspaceId", data.workspaceId);
					}

					const url = `/workspace/list-members${params.toString() ? `?${params.toString()}` : ""}`;
					return await $fetch(url, {
						method: "GET",
						...fetchOptions,
					});
				},
				// Team member methods
				addTeamMember: async (
					data: {
						workspaceId: string;
						teamId: string;
						role: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/add-team-member", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				removeTeamMember: async (
					data: {
						workspaceId: string;
						teamId: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/remove-team-member", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				updateTeamMemberRole: async (
					data: {
						workspaceId: string;
						teamId: string;
						role: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					return await $fetch("/workspace/update-team-member-role", {
						method: "POST",
						body: data,
						...fetchOptions,
					});
				},
				listTeamMembers: async (
					data: {
						workspaceId: string;
					},
					fetchOptions?: FetchOptions,
				) => {
					const params = new URLSearchParams();
					if (data.workspaceId) {
						params.append("workspaceId", data.workspaceId);
					}

					const url = `/workspace/list-team-members${params.toString() ? `?${params.toString()}` : ""}`;
					return await $fetch(url, {
						method: "GET",
						...fetchOptions,
					});
				},
			},
		}),
	};
};
