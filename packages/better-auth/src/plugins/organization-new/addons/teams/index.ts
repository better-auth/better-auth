import type { OrganizationAddons } from "../../types";
import type { TeamsOptions } from "./types";

export const teams = <O extends TeamsOptions>(options?: O | undefined) => {
	return {
		id: "teams",
	} satisfies OrganizationAddons;
};
