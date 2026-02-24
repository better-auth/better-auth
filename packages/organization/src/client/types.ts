import type { Addon } from "../types";

export interface OrgnaizationClientAddon {
	id: string;
	serverAddon: Addon;
}

export interface OrganizationClientOptions {
	use: readonly OrgnaizationClientAddon[];
}
