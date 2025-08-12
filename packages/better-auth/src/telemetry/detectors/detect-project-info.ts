// https://github.com/zkochan/packages/blob/main/which-pm-runs/index.js
export function detectPackageManager() {
	const userAgent = process.env.npm_config_user_agent;

	if (!userAgent) {
		return undefined;
	}

	const pmSpec = userAgent.split(" ")[0];
	const separatorPos = pmSpec.lastIndexOf("/");
	const name = pmSpec.substring(0, separatorPos);

	return {
		name: name === "npminstall" ? "cnpm" : name,
		version: pmSpec.substring(separatorPos + 1),
	};
}
