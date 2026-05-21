import type { OrganizationClientAddon } from "../../client/types";
import type { teams } from "../index";

export const teamsClient = () => {
	type TeamAddon = ReturnType<typeof teams<{}>>;
	return {
		id: "teams",
		serverAddon: {} as TeamAddon,
	} satisfies OrganizationClientAddon;
};
