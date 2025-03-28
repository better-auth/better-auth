import { getAuthTables, type FieldAttribute } from "better-auth/db";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import type { SchemaGenerator } from "./types";

export function convertToSnakeCase(str: string) {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export const generateDrizzleSchema: SchemaGenerator = async ({
	options,
	file,
	adapter,
}) => {
	const tables = getAuthTables(options);
	const filePath = file || "./auth-schema.ts";
	const databaseType = adapter.options?.provider;
	const usePlural = adapter.options?.usePlural;
	const timestampAndBoolean =
		databaseType !== "sqlite" ? "timestamp, boolean" : "";
	const int = databaseType === "mysql" ? "int" : "integer";
	const hasBigint = Object.values(tables).some((table: any) =>
		Object.values(table.fields).some((field: any) => field.bigint),
	);
	const bigint = databaseType !== "sqlite" ? "bigint" : "";
	const text = databaseType === "mysql" ? "varchar, text" : "text";
	
	// Required import parts for the schema
	const importItems = [
		`${databaseType}Table`, 
		text, 
		int, 
		...(hasBigint ? [bigint] : []),
		...(timestampAndBoolean ? timestampAndBoolean.split(', ') : [])
	];
	
	// Generate auth table schemas
	let authTablesCode = "";
	for (const table in tables) {
		const modelName = usePlural
			? `${tables[table]?.modelName}s`
			: tables[table]?.modelName;
		const fields = tables[table]?.fields;
		if (!modelName || !fields) continue;
		
		function getType(name: string, field: FieldAttribute) {
			name = convertToSnakeCase(name);
			const type = field.type;
			const typeMap = {
				string: {
					sqlite: `text('${name}')`,
					pg: `text('${name}')`,
					mysql: field.unique
						? `varchar('${name}', { length: 255 })`
						: field.references
							? `varchar('${name}', { length: 36 })`
							: `text('${name}')`,
				},
				boolean: {
					sqlite: `integer('${name}', { mode: 'boolean' })`,
					pg: `boolean('${name}')`,
					mysql: `boolean('${name}')`,
				},
				number: {
					sqlite: `integer('${name}')`,
					pg: field.bigint
						? `bigint('${name}', { mode: 'number' })`
						: `integer('${name}')`,
					mysql: field.bigint
						? `bigint('${name}', { mode: 'number' })`
						: `int('${name}')`,
				},
				date: {
					sqlite: `integer('${name}', { mode: 'timestamp' })`,
					pg: `timestamp('${name}')`,
					mysql: `timestamp('${name}')`,
				},
			} as const;
			return typeMap[type as "boolean"][(databaseType as "sqlite") || "sqlite"];
		}
		const id =
			databaseType === "mysql"
				? `varchar("id", { length: 36 }).primaryKey()`
				: `text("id").primaryKey()`;
		const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(
			modelName,
		)}", {
					id: ${id},
					${Object.keys(fields)
						.map((field) => {
							const attr = fields[field];
							if (!attr) return "";
							return `${field}: ${getType(field, attr)}${
								attr.required ? ".notNull()" : ""
							}${attr.unique ? ".unique()" : ""}${
								attr.references
									? `.references(()=> ${
											usePlural
												? `${attr.references.model}s`
												: attr.references.model
										}.${attr.references.field}, { onDelete: 'cascade' })`
									: ""
							}`;
						})
						.join(",\n ")}
				});`;
		authTablesCode += `\n${schema}\n`;
	}
	
	// Check if file exists to decide on updating strategy
	const fileExists = existsSync(path.resolve(process.cwd(), filePath));
	
	if (fileExists) {
		// File exists, read it and update or append
		const existingContent = await fs.readFile(path.resolve(process.cwd(), filePath), "utf-8");
		
		// Get all auth table model names to identify which parts to replace
		const authTableModelNames = Object.values(tables).map((table: any) => {
			return usePlural ? `${table.modelName}s` : table.modelName;
		});
		
		// Parse existing imports
		let existingImports: string[] = [];
		let importStartIndex = -1;
		let importEndIndex = -1;
		
		const lines = existingContent.split("\n");
		
		// Find import lines and extract imported items
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] || "";
			if (line.includes(`from "drizzle-orm/${databaseType}-core"`)) {
				// Found import line, extract the imported items
				const importMatch = line.match(/import\s*{\s*([^}]+)\s*}\s*from/);
				if (importMatch && importMatch[1]) {
					// Split and trim each imported item
					const items = importMatch[1].split(',').map(item => item.trim());
					existingImports = [...existingImports, ...items];
					
					if (importStartIndex === -1) {
						importStartIndex = i;
					}
					importEndIndex = i;
				}
			}
		}
		
		// Merge imports by combining existing with required imports
		const mergedImports = [...new Set([...existingImports, ...importItems])];
		const newImportLine = `import { ${mergedImports.join(', ')} } from "drizzle-orm/${databaseType}-core";`;
		
		// Prepare new content
		let newContent = "";
		
		// If we found existing imports, replace them with merged imports
		if (importStartIndex !== -1) {
			// Add content before the first import
			for (let i = 0; i < importStartIndex; i++) {
				newContent += lines[i] + "\n";
			}
			
			// Add merged import
			newContent += newImportLine + "\n";
			
			// Skip any other import lines from the same module
			let i = importEndIndex + 1;
			
			// Process the rest of the content, skipping auth table definitions
			let skipMode = false;
			
			while (i < lines.length) {
				const line = lines[i] || "";
				
				// Skip any additional imports from the same module
				if (line.includes(`from "drizzle-orm/${databaseType}-core"`)) {
					i++;
					continue;
				}
				
				// Check if line starts a table definition for an auth table
				if (authTableModelNames.some(modelName => 
					line.includes(`export const ${modelName} =`) ||
					line.includes(`export const ${modelName}=`)
				)) {
					// Enter skip mode until we find closing bracket of the table definition
					skipMode = true;
					i++;
					let openBrackets = 1;
					
					// Skip until we find the end of this table definition
					while (i < lines.length && openBrackets > 0) {
						const currentLine = lines[i] || "";
						if (currentLine.includes("{")) openBrackets++;
						if (currentLine.includes("}")) openBrackets--;
						i++;
					}
					
					skipMode = false;
					continue;
				}
				
				// If not in skip mode, include this line
				if (!skipMode) {
					newContent += line + "\n";
				}
				
				i++;
			}
		} else {
			// No existing imports found, add our import and keep the rest of the content
			newContent = newImportLine + "\n";
			
			// Process content line by line, skipping auth table definitions
			let i = 0;
			let skipMode = false;
			
			while (i < lines.length) {
				const line = lines[i] || "";
				
				// Check if line starts a table definition for an auth table
				if (authTableModelNames.some(modelName => 
					line.includes(`export const ${modelName} =`) ||
					line.includes(`export const ${modelName}=`)
				)) {
					// Enter skip mode until we find closing bracket of the table definition
					skipMode = true;
					i++;
					let openBrackets = 1;
					
					// Skip until we find the end of this table definition
					while (i < lines.length && openBrackets > 0) {
						const currentLine = lines[i] || "";
						if (currentLine.includes("{")) openBrackets++;
						if (currentLine.includes("}")) openBrackets--;
						i++;
					}
					
					skipMode = false;
					continue;
				}
				
				// If not in skip mode, include this line
				if (!skipMode) {
					newContent += line + "\n";
				}
				
				i++;
			}
		}
		
		// Append auth tables code
		newContent += authTablesCode;
		
		return {
			code: newContent,
			fileName: filePath,
			overwrite: true,
		};
	} else {
		// File doesn't exist, create a new one with standard import
		return {
			code: `import { ${importItems.join(', ')} } from "drizzle-orm/${databaseType}-core";\n${authTablesCode}`,
			fileName: filePath,
		};
	}
};
