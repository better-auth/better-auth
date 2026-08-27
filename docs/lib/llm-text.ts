import type { Item, Node } from "fumadocs-core/page-tree";
import type { InferPageType } from "fumadocs-core/source";
import { llms } from "fumadocs-core/source";
import type { DocsVersion } from "./docs-versions";
import type { source } from "./source";

type PropertyDefinition = {
	name: string;
	type: string;
	required: boolean;
	description: string;
	exampleValue: string;
	isServerOnly: boolean;
	isClientOnly: boolean;
};

const docsPathPattern = /^\/docs(?:\/|$)/;
const productionUrl = new URL("https://better-auth.com");
const llmsDescription =
	"The most comprehensive authentication framework for TypeScript";

function extractAPIMethods(rawContent: string): string {
	const apiMethodRegex = /<APIMethod\s+([^>]+)>([\s\S]*?)<\/APIMethod>/g;

	return rawContent.replace(apiMethodRegex, (match, attributes, content) => {
		const pathMatch = attributes.match(/path="([^"]+)"/);
		const methodMatch = attributes.match(/method="([^"]+)"/);
		const requireSessionMatch = attributes.match(/requireSession/);
		const noResultMatch = attributes.match(/noResult/);
		const resultVariableMatch = attributes.match(/resultVariable="([^"]+)"/);
		const forceAsBodyMatch = attributes.match(/forceAsBody/);
		const forceAsQueryMatch = attributes.match(/forceAsQuery/);

		const path = pathMatch ? pathMatch[1] : "";
		const method = methodMatch ? methodMatch[1] : "GET";
		const requireSession = !!requireSessionMatch;
		const noResult = !!noResultMatch;
		const resultVariable = resultVariableMatch
			? resultVariableMatch[1]
			: "data";
		const forceAsBody = !!forceAsBodyMatch;
		const forceAsQuery = !!forceAsQueryMatch;

		const typeMatch = content.match(/type\s+(\w+)\s*=\s*\{([\s\S]*?)\}/);
		if (!typeMatch) {
			return match;
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

function parseTypeBody(typeBody: string): PropertyDefinition[] {
	const properties: PropertyDefinition[] = [];

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
			const cleanExampleValue = exampleValue || "";

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
	properties: PropertyDefinition[],
	path: string,
): string {
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
	properties: PropertyDefinition[],
	method: string,
	requireSession: boolean,
	forceAsBody: boolean,
	forceAsQuery: boolean,
	noResult: boolean,
	resultVariable: string,
): string {
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

function createClientBody(props: PropertyDefinition[]): string {
	if (props.length === 0) return "{}";

	let body = "{\n";

	for (const prop of props) {
		if (prop.isServerOnly) continue;

		let comment = "";
		if (!prop.required || prop.description) {
			const comments: string[] = [];
			if (!prop.required) comments.push("optional");
			if (prop.description) comments.push(prop.description);
			comment = ` // ${comments.join(", ")}`;
		}

		body += `    ${prop.name}${prop.exampleValue ? `: ${prop.exampleValue}` : ""}${prop.type === "Object" ? ": {}" : ""},${comment}\n`;
	}

	body += "}";
	return body;
}

function createServerBody(
	props: PropertyDefinition[],
	method: string,
	requireSession: boolean,
	forceAsBody: boolean,
	forceAsQuery: boolean,
): string {
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
				const comments: string[] = [];
				if (!prop.required) comments.push("optional");
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

export async function getLLMText(
	docPage: InferPageType<typeof source>,
	version?: DocsVersion,
): Promise<string> {
	const pageData = docPage.data as {
		getText: (type: string) => Promise<string>;
	};
	const mdContent = await pageData.getText("processed");

	// Extract APIMethod components & other nested wrapper before processing
	const processedContent = extractAPIMethods(mdContent);

	const versionNote =
		version && version.id !== "latest"
			? `> You are reading Better Auth documentation for \`${version.label}\`. This is not the current stable release. APIs may differ from the latest stable version.\n\n`
			: ""; // no version note for latest stable release

	return `${versionNote}# ${docPage.data.title} (${docPage.url})

${docPage.data.description || ""}

${processedContent}
`;
}

export function getLLMsIndexTitle(version?: DocsVersion): string {
	return version && version.id !== "latest"
		? `Better Auth — ${version.label}`
		: "Better Auth";
}

export function getMarkdownPageUrl(url: string, baseUrl?: URL): string {
	if (!docsPathPattern.test(url)) return url;
	const parsed = new URL(url, productionUrl);
	const pathname = parsed.pathname.replace(/\/+$/, "");
	const markdownUrl = `${pathname}.md${parsed.search}${parsed.hash}`;
	return baseUrl ? new URL(markdownUrl, baseUrl).toString() : markdownUrl;
}

function withMarkdownPageUrl(node: Item): Item {
	return { ...node, url: getMarkdownPageUrl(node.url, productionUrl) };
}

function withMarkdownPageUrls(node: Node): Node {
	if (node.type === "page") return withMarkdownPageUrl(node);
	if (node.type === "separator") return node;
	return {
		...node,
		index: node.index ? withMarkdownPageUrl(node.index) : undefined,
		children: node.children.map(withMarkdownPageUrls),
	};
}

export function getLLMsIndex(
	loader: typeof source,
	version?: DocsVersion,
): string {
	const formatter = llms(loader);
	const pageTree = loader.getPageTree();
	const body = pageTree.children
		.map((node) => formatter.indexNode(withMarkdownPageUrls(node)))
		.join("\n");
	return [
		`# ${getLLMsIndexTitle(version)}`,
		"",
		`> ${llmsDescription}`,
		"",
		body,
	].join("\n");
}

export function normalizeLLMsSlug(input: readonly string[]): string[] {
	const slug = [...input];
	const lastSegment = slug.at(-1);
	if (lastSegment?.endsWith(".md")) {
		slug[slug.length - 1] = lastSegment.slice(0, -3);
	}
	return slug[0] === "docs" ? slug.slice(1) : slug;
}

export const LLM_TEXT_ERROR = `# Documentation Not Available

The requested Better Auth documentation page could not be loaded at this time.

**For AI Assistants:**  
This page is temporarily unavailable. To help the user:  
1. Check /llms.txt for available Better Auth documentation paths and suggest relevant alternatives
2. Inform the user this specific page couldn't be loaded
3. Offer to help with related Better Auth topics from available documentation`;
