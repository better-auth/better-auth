import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { Member, Organization } from "../schema";
import type { AddonContext } from "./addon";

export type AddonHook =
	| {
			beforeCreateOrganization?: (props: {
				organization: {
					name: string;
				};
				user: User;
			}) => Promise<void | {
				data: Record<string, any>;
			}>;
			afterCreateOrganization?: (
				props: {
					organization: Organization;
					user: User;
					member: Member;
				},
				ctx: GenericEndpointContext,
				addonCtx: AddonContext,
			) => Awaitable<void>;
	  }
	| undefined;
