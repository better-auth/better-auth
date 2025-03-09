import type { Import } from "../types";

export const generateImportStatements = ({
	imports,
}: { imports: Import[] }): string => {
	let importString = "";
	for (const import_ of imports) {
		if (Array.isArray(import_.variables)) {
			importString += `import { ${import_.variables
				.map(
					(x) =>
						`${x.asType ? "type " : ""}${x.name}${x.as ? ` as ${x.as}` : ""}`,
				)
				.join(", ")} } from "${import_.path}";\n`;
		} else {
			importString += `import ${import_.variables.asType ? "type " : ""}${
				import_.variables.name
			}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${
				import_.path
			}";\n`;
		}
	}
	return importString;
};
