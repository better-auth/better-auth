import type { OrganizationAddons } from "../../types";
import type { AccessControlOptions } from "./types";

export const accessControl = <O extends AccessControlOptions>(
	options?: O | undefined,
) => {
	return {
		id: "access-control",
		priority: 5, // Run early to set up access control before other addons
	} satisfies OrganizationAddons<O>;
};
