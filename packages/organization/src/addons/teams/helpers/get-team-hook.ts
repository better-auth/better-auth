import type { GenericEndpointContext } from "@better-auth/core";
import { getAddon } from "../../../helpers/get-addon";
import type { ResolvedOrganizationOptions } from "../../../types";
import type { TeamsAddon } from "..";
import type { ResolvedTeamsOptions, TeamHooks } from "../types";

type HookOptions =
	| "CreateTeam"
	| "UpdateTeam"
	| "DeleteTeam"
	| "AddTeamMember"
	| "UpdateTeamMember"
	| "RemoveTeamMember";

type Hooks = NonNullable<TeamHooks>;

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
	overwriteOptions?: ResolvedTeamsOptions,
) => {
	type Before = NonNullable<Hooks[`before${H}`]>;
	type After = NonNullable<Hooks[`after${H}`]>;

	type ReturnT = {
		before: (
			data: Parameters<Before>[0],
			ctx?: GenericEndpointContext,
		) => Promise<InferHookResponse<ReturnType<Before>> | null>;
		after: (
			data: Parameters<After>[0],
			ctx?: GenericEndpointContext,
		) => Promise<void>;
	};

	return {
		before: async (
			data: Parameters<Before>[0],
			ctx?: GenericEndpointContext,
		) => {
			const options = (() => {
				if (overwriteOptions) return overwriteOptions;
				const orgOptions = ctx?.context.getPlugin("organization")
					?.options as ResolvedOrganizationOptions;
				const [addon] = getAddon(orgOptions, "teams", {} as TeamsAddon);
				const options = addon?.options as ResolvedTeamsOptions;
				return options;
			})();
			if (!options) return null;
			const hookFn = options.hooks?.[`before${hook}`] as Before | undefined;
			if (!hookFn) return null;
			//@ts-expect-error - intentional
			const response = await hookFn(data, ctx);
			if (response && typeof response === "object" && "data" in response) {
				return response.data;
			}
			return null;
		},
		after: async (data: Parameters<After>[0], ctx?: GenericEndpointContext) => {
			const options = (() => {
				if (overwriteOptions) return overwriteOptions;
				const orgOptions = ctx?.context.getPlugin("organization")
					?.options as ResolvedOrganizationOptions;
				const [addon] = getAddon(orgOptions, "teams", {} as TeamsAddon);
				const options = addon?.options as ResolvedTeamsOptions;
				return options;
			})();

			if (!options) return null;
			const hookFn = options.hooks?.[`after${hook}`] as After | undefined;
			if (!hookFn) return null;
			//@ts-expect-error - intentional
			await hookFn(data, ctx);
		},
	} as ReturnT;
};
