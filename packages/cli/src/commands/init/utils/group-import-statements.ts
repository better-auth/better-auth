import type { Import } from "../types";

/**
 * Given an array of imports (optional), and an array of plugins, it will group the imports together.
 * For example, if a plugin imports a variable from a module, and another plugin imports the same variable from the same module,
 * then the second plugin will be added to the first plugin's imports.
 */
export const groupImportStatements = ({
	initialImports,
	additionalImports,
}: {
	initialImports?: Import[];
	additionalImports: Import[];
}): Import[] => {
	const imports: Import[] = initialImports || [];
	for (const import_ of additionalImports) {
		if (Array.isArray(import_.variables)) {
			for (const variable of import_.variables) {
				const existingIndex = imports.findIndex((x) => x.path === import_.path);
				if (existingIndex !== -1) {
					const vars = imports[existingIndex]!.variables;
					if (Array.isArray(vars)) {
						vars.push(variable);
					} else {
						imports[existingIndex]!.variables = [vars, variable];
					}
				} else {
					imports.push({
						path: import_.path,
						variables: [variable],
					});
				}
			}
		} else {
			imports.push({ path: import_.path, variables: import_.variables });
		}
	}
	return imports;
};
