import type { Addon } from "../types";

export interface OrganizationClientAddon {
	id: string;
	serverAddon: Addon;
}

export interface OrganizationClientOptions {
	use: readonly OrganizationClientAddon[];
}
