import type { User } from "better-auth";
import type { Member } from "better-auth/plugins";

export interface SCIMProvider {
	id: string;
	providerId: string;
	scimToken: string;
	organizationId?: string;
}

export type SCIMName = {
	formatted?: string;
	givenName?: string;
	familyName?: string;
};

export type SCIMEmail = { value?: string; primary?: boolean };

export type SCIMOptions = {
	/**
	 * A callback that runs before a new SCIM token is generated.
	 * @returns
	 */
	beforeSCIMTokenGenerated?: ({
		user,
		member,
		scimToken,
	}: {
		user: User;
		member?: Member | null;
		scimToken: string;
	}) => Promise<void>;

	/**
	 * A callback that runs before a new SCIM token is generated
	 * @returns
	 */
	afterSCIMTokenGenerated?: ({
		user,
		member,
		scimProvider,
	}: {
		user: User;
		member?: Member | null;
		scimToken: string;
		scimProvider: SCIMProvider;
	}) => Promise<void>;
	/**
	 * Store the SCIM token in your database in a secure way
	 *
	 * @default "plain"
	 */
	storeSCIMToken?:
		| (
				| "hashed"
				| "plain"
				| "encrypted"
				| { hash: (scimToken: string) => Promise<string> }
				| {
						encrypt: (scimToken: string) => Promise<string>;
						decrypt: (scimToken: string) => Promise<string>;
				  }
		  )
		| undefined;
};
