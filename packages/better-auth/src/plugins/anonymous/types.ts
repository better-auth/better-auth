import type {
	AuthContext,
	Awaitable,
	GenericEndpointContext,
} from "@better-auth/core";
import type { EndpointContext } from "better-call";
import type { InferOptionSchema, Session, User } from "../../types";
import type { schema } from "./schema";

export type AnonymousSession = { session: Session; user: User } & {
	user: { isAnonymous: boolean | null };
} & Record<string, any>;

export interface UserWithAnonymous extends User {
	isAnonymous: boolean;
}

export interface AnonymousOptions {
	/**
	 * Configure the domain name of the temporary email
	 * address for anonymous users in the database.
	 * @default "baseURL"
	 */
	emailDomainName?: string | undefined;
	/**
	 * Controls what happens to the anonymous user when they sign in or sign up
	 * with a real credential while an anonymous session is active.
	 *
	 * - `"create"` (default): the credential creates or resolves its own user,
	 *   and the anonymous user is deleted afterwards (unless
	 *   `disableDeleteAnonymousUser` is set). Use `onLinkAccount` to migrate the
	 *   anonymous user's data to the new user.
	 *
	 * - `"promote"`: when the incoming credential would create a brand-new user,
	 *   the anonymous user is upgraded in place instead: their row is updated
	 *   with the credential's email, verified status, name and image, and
	 *   `isAnonymous` is cleared. The freshly created account rows are re-pointed
	 *   at the anonymous user's id and the new session is re-pointed so the
	 *   session cookie that was already written stays valid. The user id never
	 *   changes, existing sessions remain valid, and no second user row is
	 *   created, so no data migration is needed.
	 *
	 *   When the credential resolves to a user that already exists (the email is
	 *   taken, or a returning social identity), in-place promotion is not
	 *   possible. That case falls back to the classic flow: `onLinkAccount`
	 *   fires and the anonymous user is deleted as usual.
	 *
	 * @default "create"
	 */
	onLink?: "create" | "promote" | undefined;
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
		  }) => Awaitable<void>)
		| undefined;
	/**
	 * Disable deleting the anonymous user
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
		  ) => Awaitable<string>)
		| undefined;
	/**
	 * A custom random email generation function.
	 * Useful when you want to specify a temporary email in a different format from the default.
	 * You are responsible for ensuring the email is unique to avoid conflicts.
	 * @returns The email address for the anonymous user.
	 */
	generateRandomEmail?: (() => Awaitable<string>) | undefined;
	/**
	 * Custom schema for the anonymous plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
}
