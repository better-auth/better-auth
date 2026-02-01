import type { GenericEndpointContext } from "@better-auth/core";
import type { OrganizationHooks, ResolvedOrganizationOptions } from "../types";

type HookOptions =
	| "CreateOrganization"
	| "UpdateOrganization"
	| "DeleteOrganization"
	| "AddMember"
	| "RemoveMember"
	| "UpdateMemberRole"
	| "CreateInvitation"
	| "AcceptInvitation"
	| "RejectInvitation"
	| "CancelInvitation";

type Hooks = NonNullable<OrganizationHooks>;

type AwaitedResponse<T> = T extends Promise<infer R> ? R : T;

type NonVoidable<T> = T extends void ? null : T;

type InferHookResponse<T> =
	NonNullable<NonVoidable<AwaitedResponse<T>>> extends {
		data: Record<string, any>;
	}
		? NonNullable<NonVoidable<AwaitedResponse<T>>>["data"]
		: null;

/**
 * Helper function to provide before and after hook functions based on the hook name.
 */
export const getHook = <H extends HookOptions>(
	hook: H,
	options: ResolvedOrganizationOptions,
) => {
	type Before = NonNullable<Hooks[`before${H}`]>;
	type After = NonNullable<Hooks[`after${H}`]>;

	type ReturnT = {
		before: (
			...data: Parameters<Before>
		) => Promise<InferHookResponse<ReturnType<Before>> | null>;
		after: (...data: Parameters<After>) => Promise<void>;
	};

	return {
		before: async (
			data: Parameters<Before>[0],
			ctx: GenericEndpointContext,
		) => {
			const hookFn = options.hooks?.[`before${hook}`] as Before | undefined;
			if (!hookFn) return null;
			//@ts-expect-error - intentional
			const response = await hookFn(data, ctx);
			if (response && typeof response === "object" && "data" in response) {
				return response.data;
			}
			return null;
		},
		after: async (data: Parameters<After>[0], ctx: GenericEndpointContext) => {
			const hookFn = options.hooks?.[`after${hook}`] as After | undefined;
			if (!hookFn) return null;
			//@ts-expect-error - intentional
			await hookFn(data, ctx);
		},
	} as ReturnT;
};
