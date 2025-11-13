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
	 * The list of roles that are considered admin roles. Only users with these roles will be able to sync information through SCIM
	 * @default ["admin", "owner"]
	 */
	adminRoles?: string[];
	/**
	 * The list of user ids that are considered admins. Only users with these ids will be able to sync information through SCIM
	 */
	adminUserIds?: string[];
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
