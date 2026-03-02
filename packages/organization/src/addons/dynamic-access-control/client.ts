import type { OrganizationClientAddon } from "../../client/types";
import type { dynamicAccessControl } from "../index";

export const dynamicAccessControlClient = () => {
	type DynamicAccessControlAddon = ReturnType<typeof dynamicAccessControl<{}>>;
	return {
		id: "dynamic-access-control",
		serverAddon: {} as DynamicAccessControlAddon,
	} satisfies OrganizationClientAddon;
};
