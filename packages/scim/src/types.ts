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
	 * Store the SCIM token in your database in a secure way
	 *
	 * @default "plain"
	 */
	storeSCIMToken?:
		| (
				| "hashed"
				| "plain"
				| "encrypted"
				| { hash: (otp: string) => Promise<string> }
				| {
						encrypt: (otp: string) => Promise<string>;
						decrypt: (otp: string) => Promise<string>;
				  }
		  )
		| undefined;
};
