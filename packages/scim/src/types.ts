export interface SCIMProvider {
	providerId: string;
	scimToken: string;
	organizationId: string;
}

export type SCIMName = {
	formatted?: string;
	givenName?: string;
	familyName?: string;
};

export type SCIMEmail = { value?: string; primary?: boolean };
