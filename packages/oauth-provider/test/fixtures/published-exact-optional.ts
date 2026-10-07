import { oauthProvider } from "@better-auth/oauth-provider";
import { organizationClient } from "better-auth/client/plugins";
import type { InferMember } from "better-auth/plugins/organization";
import { organization } from "better-auth/plugins/organization";

const organizationPlugin = organization({ teams: { enabled: true } });
const clientPlugin = organizationClient({ teams: { enabled: true } });
const providerPlugin = oauthProvider({
	loginPage: "/login",
	consentPage: "/consent",
});

export const organizationId = organizationPlugin.id;
export const clientId = clientPlugin.id;
export const providerId = providerPlugin.id;

export async function activeRole(headers: Headers) {
	const result = await organizationPlugin.endpoints.getActiveMemberRole({
		headers,
	});
	return result.role;
}

type Assert<T extends true> = T;
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

type PlainMember = InferMember<{ teams: { enabled: false } }>;
type TeamMember = InferMember<{ teams: { enabled: true } }>;
type CustomMember = InferMember<{
	schema: {
		member: {
			additionalFields: {
				department: { type: "string"; required: true };
				internalNote: { type: "string"; required: true; returned: false };
			};
		};
	};
}>;

export type RoleRemainsExact = Assert<
	Equal<PlainMember["role"], "admin" | "member" | "owner">
>;
export type PlainMemberHasNoTeamId = Assert<
	Equal<"teamId" extends keyof PlainMember ? true : false, false>
>;
export type TeamIdRemainsOptional = Assert<
	Equal<TeamMember["teamId"], string | undefined>
>;
export type CustomDepartmentIsRequired = Assert<
	Equal<CustomMember["department"], string>
>;
export type ClientDoesNotExposePrivateField = Assert<
	Equal<"internalNote" extends keyof CustomMember ? true : false, false>
>;
export type ServerTeamOptionRejectsExplicitUndefined = Assert<
	Equal<
		{ teams: undefined } extends NonNullable<Parameters<typeof organization>[0]>
			? true
			: false,
		false
	>
>;
export type ClientTeamOptionRetainsExplicitUndefined = Assert<
	Equal<
		{ teams: undefined } extends NonNullable<
			Parameters<typeof organizationClient>[0]
		>
			? true
			: false,
		true
	>
>;
