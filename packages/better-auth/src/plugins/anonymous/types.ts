import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import type { EndpointContext } from "better-call";
import type { InferOptionSchema, Session, User } from "../../types";
import type { schema } from "./schema";

export interface UserWithAnonymous extends User {
	isAnonymous: boolean;
}
export interface AnonymousOptions {
	/**
	 * Local part of the temporary email address.
	 * - If `emailDomainName` provided: `{emailLocalPart}-{id}@{emailDomainName}`
	 * - If `emailDomainName` not provided: `{emailLocalPart}@{id}.com`
	 * @default "temp"
	 */
	emailLocalPart?: string | undefined;
	/**
	 * Domain name of the temporary email address.
	 * - If provided: `{emailLocalPart}-{id}@{emailDomainName}`
	 * - If not provided: `{emailLocalPart}@{id}.com`
	 * @default undefined
	 */
	emailDomainName?: string | undefined;
	/**
	 * A useful hook to run after an anonymous user
	 * is about to link their account.
	 */
	onLinkAccount?:
		| ((data: {
				anonymousUser: {
					user: UserWithAnonymous & Record<string, any>;
					session: Session & Record<string, any>;
				};
				newUser: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
				};
				ctx: GenericEndpointContext;
		  }) => Promise<void> | void)
		| undefined;
	/**
	 * Disable deleting the anonymous user after linking
	 */
	disableDeleteAnonymousUser?: boolean | undefined;
	/**
	 * A hook to generate a name for the anonymous user.
	 * Useful if you want to have random names for anonymous users, or if `name` is unique in your database.
	 * @returns The name for the anonymous user.
	 */
	generateName?:
		| ((
				ctx: EndpointContext<
					"/sign-in/anonymous",
					{
						method: "POST";
					},
					AuthContext
				>,
		  ) => Promise<string> | string)
		| undefined;
	/**
	 * Custom schema for the anonymous plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
}
