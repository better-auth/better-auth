import { formatCode } from "./format";

export type NamedImportGroup = {
	/**
	 * The path of the import
	 */
	path: string;
	/**
	 * The imports in the group.
	 */
	imports: Import;
	/**
	 * Wether the import is importing from a `default export` or a `named export`
	 */
	isNamedImport: true;
};

export type NormalImportGroup = {
	/**
	 * The path of the import
	 */
	path: string;
	/**
	 * The imports in the group.
	 */
	imports: Import[];
	/**
	 * Wether the import is a default import
	 */
	isNamedImport: false;
};

/**
 * A collection of imports that are grouped by the same path.
 */
export type ImportGroup = NormalImportGroup | NamedImportGroup;

/**
 * An import. Doesn't necessarily represent a single import statement. (Unless the `isDefaultExport` is `true`)
 */
export type Import = {
	name: string;
	alias: string | null;
	asType: boolean;
};

/**
 * Helper function to create an import object.
 */
export const createImport = ({
	name,
	alias,
	asType,
}: {
	name: string;
	alias?: string;
	asType?: boolean;
}) => {
	return {
		name,
		alias: alias ?? null,
		asType: asType ?? false,
	} satisfies Import;
};

/**
 * Converts an import object to a string. This is specifically for the variables in the import.
 * For the full import statement, use the `getImportString` function.
 */
const getImportVariableString = (import_: Import) => {
	let alias = import_.alias ? ` as ${import_.alias}` : "";
	let asType = import_.asType ? "type " : "";
	return `${asType}${import_.name}${alias}`.trim();
};

/**
 * Takes a collection of imports and returns a string of import statements.
 */
export const getImportString = async (imports: ImportGroup[]) => {
	const groupedImports = groupImports(imports);
	let importString = "";
	for (const { imports, path, isNamedImport } of groupedImports) {
		const vars = isNamedImport
			? getImportVariableString(imports)
			: `{ ${imports.map(getImportVariableString).join(", ")} }`;
		importString += `import ${vars} from "${path}";\n`;
	}
	return (await formatCode(importString)).trim();
};

/**
 * Takes a collection of imports and groups them by path.
 */
export const groupImports = (imports: ImportGroup[]) => {
	const result: ImportGroup[] = [];

	for (const import_ of imports) {
		// If the import is a named import, add it to the result.
		if (import_.isNamedImport) {
			result.push(import_);
			continue;
		}

		// If the import is a normal import, check if it already exists in the result.
		const existingIndex = result.findIndex(
			(x) => x.path === import_.path && !x.isNamedImport,
		);

		// If the import already exists, add the imports to the existing import.
		if (existingIndex !== -1) {
			(result[existingIndex]!.imports as Import[]).push(...import_.imports);
			continue;
		}

		// If the import is not in the result, add it.
		result.push(import_);
	}

	// Sort the result by path, with named imports at the end.
	return result.sort((a, b) => {
		if (a.isNamedImport && !b.isNamedImport) return 1;
		if (!a.isNamedImport && b.isNamedImport) return -1;
		return a.path.localeCompare(b.path);
	});
};
