import type { organization } from "../organization";
import type { OrganizationClientOptions } from "./types";

export const organizationClient = <CO extends OrganizationClientOptions>(
	options?: CO | undefined,
) => {
	return {
		id: "organization",
		$InferServerPlugin: {} as ReturnType<
			typeof organization<{ use: CO["use"][number]["serverAddon"][] }>
		>,
	};
};
