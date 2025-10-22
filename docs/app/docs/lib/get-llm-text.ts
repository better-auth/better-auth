import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { fileGenerator, remarkDocGen } from "fumadocs-docgen";
import { remarkNpm } from "fumadocs-core/mdx-plugins";
import remarkStringify from "remark-stringify";
import remarkMdx from "remark-mdx";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import { remarkInclude } from "fumadocs-mdx/config";
import { readFile } from "fs/promises";

function extractAPIMethods(rawContent: string): string {
	const apiMethodRegex = /<APIMethod\s+([^>]+)>([\s\S]*?)<\/APIMethod>/g;

	return rawContent.replace(apiMethodRegex, (match, attributes, content) => {
		// Parse attributes by matching
		const pathMatch = attributes.match(/path="([^"]+)"/);
		const methodMatch = attributes.match(/method="([^"]+)"/);
		const requireSessionMatch = attributes.match(/requireSession/);
		const isServerOnlyMatch = attributes.match(/isServerOnly/);
		const isClientOnlyMatch = attributes.match(/isClientOnly/);
		const noResultMatch = attributes.match(/noResult/);
		const resultVariableMatch = attributes.match(/resultVariable="([^"]+)"/);
		const forceAsBodyMatch = attributes.match(/forceAsBody/);
		const forceAsQueryMatch = attributes.match(/forceAsQuery/);

		const path = pathMatch ? pathMatch[1] : "";
		const method = methodMatch ? methodMatch[1] : "GET";
		const requireSession = !!requireSessionMatch;
		const isServerOnly = !!isServerOnlyMatch;
		const isClientOnly = !!isClientOnlyMatch;
		const noResult = !!noResultMatch;
		const resultVariable = resultVariableMatch
			? resultVariableMatch[1]
			: "data";
		const forceAsBody = !!forceAsBodyMatch;
		const forceAsQuery = !!forceAsQueryMatch;

		const typeMatch = content.match(/type\s+(\w+)\s*=\s*\{([\s\S]*?)\}/);
		if (!typeMatch) {
			return match; // Return original if no type found
		}

		const functionName = typeMatch[1];
		const typeBody = typeMatch[2];

		const properties = parseTypeBody(typeBody);

		const clientCode = generateClientCode(functionName, properties, path);
		const serverCode = generateServerCode(
			functionName,
			properties,
			method,
			requireSession,
			forceAsBody,
			forceAsQuery,
			noResult,
			resultVariable,
		);

		return `
### Client Side

\`\`\`ts
${clientCode}
\`\`\`

### Server Side

\`\`\`ts
${serverCode}
\`\`\`

### Type Definition

\`\`\`ts
type ${functionName} = {${typeBody}
}
\`\`\`
`;
	});
}

function parseTypeBody(typeBody: string) {
	const properties: Array<{
		name: string;
		type: string;
		required: boolean;
		description: string;
		exampleValue: string;
		isServerOnly: boolean;
		isClientOnly: boolean;
	}> = [];

	const lines = typeBody.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*"))
			continue;
		const propMatch = trimmed.match(
			/^(\w+)(\?)?:\s*(.+?)(\s*=\s*["']([^"']+)["'])?(\s*\/\/\s*(.+))?$/,
		);
		if (propMatch) {
			const [, name, optional, type, , exampleValue, , description] = propMatch;

			let cleanType = type.trim();
			let cleanExampleValue = exampleValue || "";

			cleanType = cleanType.replace(/,$/, "");

			properties.push({
				name,
				type: cleanType,
				required: !optional,
				description: description || "",
				exampleValue: cleanExampleValue,
				isServerOnly: false,
				isClientOnly: false,
			});
		}
	}

	return properties;
}

// Generate client code example
function generateClientCode(
	functionName: string,
	properties: any[],
	path: string,
) {
	if (!functionName || !path) {
		return "// Unable to generate client code - missing function name or path";
	}

	const clientMethodPath = pathToDotNotation(path);
	const body = createClientBody(properties);

	return `const { data, error } = await authClient.${clientMethodPath}(${body});`;
}

// Generate server code example
function generateServerCode(
	functionName: string,
	properties: any[],
	method: string,
	requireSession: boolean,
	forceAsBody: boolean,
	forceAsQuery: boolean,
	noResult: boolean,
	resultVariable: string,
) {
	if (!functionName) {
		return "// Unable to generate server code - missing function name";
	}

	const body = createServerBody(
		properties,
		method,
		requireSession,
		forceAsBody,
		forceAsQuery,
	);

	return `${noResult ? "" : `const ${resultVariable} = `}await auth.api.${functionName}(${body});`;
}

function pathToDotNotation(input: string): string {
	return input
		.split("/")
		.filter(Boolean)
		.map((segment) =>
			segment
				.split("-")
				.map((word, i) =>
					i === 0
						? word.toLowerCase()
						: word.charAt(0).toUpperCase() + word.slice(1),
				)
				.join(""),
		)
		.join(".");
}

// Helper function to create client body (simplified version)
function createClientBody(props: any[]) {
	if (props.length === 0) return "{}";

	let body = "{\n";

	for (const prop of props) {
		if (prop.isServerOnly) continue;

		let comment = "";
		if (!prop.required || prop.description) {
			const comments = [];
			if (!prop.required) comments.push("required");
			if (prop.description) comments.push(prop.description);
			comment = ` // ${comments.join(", ")}`;
		}

		body += `    ${prop.name}${prop.exampleValue ? `: ${prop.exampleValue}` : ""}${prop.type === "Object" ? ": {}" : ""},${comment}\n`;
	}

	body += "}";
	return body;
}

function createServerBody(
	props: any[],
	method: string,
	requireSession: boolean,
	forceAsBody: boolean,
	forceAsQuery: boolean,
) {
	const relevantProps = props.filter((x) => !x.isClientOnly);

	if (relevantProps.length === 0 && !requireSession) {
		return "{}";
	}

	let serverBody = "{\n";

	if (relevantProps.length > 0) {
		const bodyKey =
			(method === "POST" || forceAsBody) && !forceAsQuery ? "body" : "query";
		serverBody += `    ${bodyKey}: {\n`;

		for (const prop of relevantProps) {
			let comment = "";
			if (!prop.required || prop.description) {
				const comments = [];
				if (!prop.required) comments.push("required");
				if (prop.description) comments.push(prop.description);
				comment = ` // ${comments.join(", ")}`;
			}

			serverBody += `        ${prop.name}${prop.exampleValue ? `: ${prop.exampleValue}` : ""}${prop.type === "Object" ? ": {}" : ""},${comment}\n`;
		}

		serverBody += "    }";
	}

	if (requireSession) {
		if (relevantProps.length > 0) serverBody += ",";
		serverBody +=
			"\n    // This endpoint requires session cookies.\n    headers: await headers()";
	}

	serverBody += "\n}";
	return serverBody;
}

const processor = remark()
	.use(remarkMdx)
	.use(remarkInclude)
	.use(remarkGfm)
	.use(remarkAutoTypeTable)
	.use(remarkDocGen, { generators: [fileGenerator()] })
	.use(remarkNpm)
	.use(remarkStringify);

export async function getLLMText(docPage: any) {
	const category = [docPage.slugs[0]];

	// Read the raw file content
	const rawContent = await readFile(docPage.data._file.absolutePath, "utf-8");

	// Extract APIMethod components & other nested wrapper before processing
	const processedContent = extractAPIMethods(rawContent);

	const processed = await processor.process({
		path: docPage.data._file.absolutePath,
		value: processedContent,
	});

	return `# ${category}: ${docPage.data.title}
URL: ${docPage.url}
Source: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/${
		docPage.file.path
	}

${docPage.data.description}
        
${processed.toString()}
`;
}
