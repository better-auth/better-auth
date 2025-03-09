import type { SupportedFramework } from "../supported-frameworks";
import type { SupportedPlugin } from "../supported-plugins";
import type { Format } from "../types";
import { groupImportStatements } from "../utils/group-import-statements";
import { generateImportStatements } from "./import-statements";

export const generateAuthClient = async ({
	auth_config_path,
	framework,
	plugins,
	format,
}: {
	framework: SupportedFramework;
	auth_config_path: string;
	plugins: SupportedPlugin[];
	format: Format;
}) => {
	// make sure that the plugins have clientName defined, making them valid client plugins.
	plugins = plugins.filter((x) => x.clientName !== undefined);

	// Group all import statements together
	const imports = groupImportStatements({
		initialImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "inferAdditionalFields" }],
			},
		],
		additionalImports: plugins.map((x) => x.clientImports).flat(),
	});
	// generate code for import statements
	let importString = generateImportStatements({ imports });

	let authClientImportPath = "client";
	if (
		framework === "next" ||
		framework === "tanstack-start" ||
		framework === "remix" ||
		framework === "solid"
	) {
		authClientImportPath = "react";
	} else if (framework === "vanilla" || framework === "astro") {
		authClientImportPath = "client";
	} else if (framework === "svelte") {
		authClientImportPath = "svelte";
	} else if (framework === "nuxt") {
		authClientImportPath = "vue";
	}

	let port = "3000";
	if (framework === "svelte") port = "5173";
	else if (framework === "astro") port = "4321";

	return await format(
		[
			`import { createAuthClient } from "better-auth/${authClientImportPath}";`,
			`import type { auth } from "${auth_config_path}";`,
			importString,
			``,
			`export const authClient = createAuthClient({`,
			`baseURL: "http://localhost:${port}",`,
			`plugins: [inferAdditionalFields<typeof auth>(),${plugins
				.map((x) => `${x.clientName}(${x.defaultClientContent})`)
				.join(", ")}],`,
			`});`,
		].join("\n"),
	);
};
