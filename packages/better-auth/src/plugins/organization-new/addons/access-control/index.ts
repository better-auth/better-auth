import type { OrganizationAddons } from "../../types";
import type { AccessControlOptions } from "./types";

export const accessControl = <O extends AccessControlOptions>(
	options?: O | undefined,
) => {
	return {
		id: "access-control",
	} satisfies OrganizationAddons;
};
