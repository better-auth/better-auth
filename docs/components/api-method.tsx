import { Endpoint } from "./endpoint";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";

type Property = {
	isOptional: boolean;
	description: string | null;
	propName: string;
	type: string;
	exampleValue: string | null;
	comments: string | null;
	isServerOnly: boolean;
};

export const APIMethod = ({
	path,
	isServerOnly,
	method,
	children,
	noResult,
	requireSession,
	clientMessage,
	serverMessage,
}: {
	/**
	 * Endpoint path
	 */
	path: string;
	/**
	 *  If enabled, we will add `headers` to the fetch options, indicating the given API method requires auth headers.
	 *
	 * @default false
	 */
	requireSession?: boolean;
	/**
	 * The HTTP method to the endpoint
	 *
	 * @default "GET"
	 */
	method?: "POST" | "GET" | "DELETE" | "PUT";
	/**
	 * Wether the endpoint is server only or not.
	 *
	 * @default false
	 */
	isServerOnly?: boolean;
	/**
	 * The `ts` codeblock which describes the API method.
	 * I recommend checking other parts of the Better-Auth docs which is using this component to get an idea of how to
	 * write out the children.
	 */
	children: JSX.Element;
	/**
	 * If enabled, will remove the `const data = ` part, since this implies there will be no return data from the API method.
	 */
	noResult?: boolean;
	/**
	 * A string to display above the client-auth example code-block.
	 */
	clientMessage?: string;
	/**
	 * A string to display above the server-auth example code-block.
	 */
	serverMessage?: string;
}) => {
	// These two variables are essentially taking the `children` JSX shiki code, and converting them to
	// an array string purely of it's code content.
	const arrayOfJSXCode = children?.props.children.props.children.props.children
		.map((x: any) =>
			x === "\n" ? { props: { children: { props: { children: "\n" } } } } : x,
		)
		.map((x: any) => x.props.children);
	const arrayOfCode: string[] = arrayOfJSXCode
		.flatMap(
			(
				x: { props: { children: string } } | { props: { children: string } }[],
			) => {
				return getChildren(x);
			},
		)
		.join("")
		.split("\n");

	let props: Property[] = [];

	const placeholderProperty: Property = {
		isOptional: false,
		comments: null,
		description: null,
		exampleValue: null,
		propName: "",
		type: "",
		isServerOnly: false,
	};

	let functionName: string = "";
	let currentJSDocDescription: string = "";

	let withinApiMethodType = false;
	let hasAlreadyDefinedApiMethodType = false;
	let isServerOnly_ = false;

	let code_prefix = "";
	let code_suffix = "";

	for (let line of arrayOfCode) {
		const originalLine = line;
		line = line.trim();
		if (line === "}" && withinApiMethodType) {
			withinApiMethodType = false;
			hasAlreadyDefinedApiMethodType = true;
			continue;
		}
		if (
			line.toLowerCase().startsWith("type") &&
			!hasAlreadyDefinedApiMethodType &&
			!withinApiMethodType
		) {
			withinApiMethodType = true;
			// Will grab the name of the API method function name from:
			// type createOrganization = {
			//      ^^^^^^^^^^^^^^^^^^
			functionName = line.replace("type ", "").split("=")[0].trim();
			continue;
		}

		if (!withinApiMethodType) {
			if (!hasAlreadyDefinedApiMethodType) {
				code_prefix += originalLine + "\n";
			} else {
				code_suffix += "\n" + originalLine + "";
			}
			continue;
		}
		if (
			line.startsWith("/*") ||
			line.startsWith("*") ||
			line.startsWith("*/")
		) {
			if (line.startsWith("/*")) {
				continue;
			} else if (line.startsWith("*/")) {
				continue;
			} else {
				if (line === "*" || line === "* ") continue;
				line = line.replace("* ", "");
				if (line.trim() === "@serverOnly") {
					isServerOnly_ = true;
					continue;
				}
				currentJSDocDescription += line + " ";
			}
		} else {
			// New property field
			// Example:
			// name: string = "My Organization",
			let propName = line.split(":")[0].trim();
			const isOptional = propName.endsWith("?") ? true : false;
			if (isOptional) propName = propName.slice(0, -1); // Remove `?` in propname.
			const propType = line
				.replace(propName, "")
				.replace("?", "")
				.replace(":", "")
				.split("=")[0]
				.trim()!;

			let exampleValue = !line.includes("=")
				? null
				: line
						.replace(propName, "")
						.replace("?", "")
						.replace(":", "")
						.replace(propType, "")
						.replace("=", "")
						.trim();

			if (exampleValue?.endsWith(",")) exampleValue = exampleValue.slice(0, -1);
			if (exampleValue) {
				try {
					exampleValue = JSON.stringify(JSON.parse(exampleValue), null, 4);
				} catch (err) {}
			}

			// const comments =
			// 	line
			// 		.replace(propName, "")
			// 		.replace("?", "")
			// 		.replace(":", "")
			// 		.replace(propType, "")
			// 		.replace("=", "")
			// 		.replace(exampleValue || "IMPOSSIBLE_TO_REPLACE_!!!!", "")
			// 		.split("//")[1] ?? null;

			const comments = null;

			const description =
				currentJSDocDescription.length > 0 ? currentJSDocDescription : null;
			if (description) {
				currentJSDocDescription = "";
			}

			const property: Property = {
				...placeholderProperty,
				description,
				comments,
				exampleValue,
				isOptional,
				propName,
				type: propType,
				isServerOnly: isServerOnly_,
			};

			if (isServerOnly_ === true) isServerOnly_ = false;

			props.push(property);
		}
	}
	// Sort the order of properties.
	props = sortProperties(props);

	let body = ``;
	let isOptionalPropertiesSection = false;
	for (const prop of props) {
		if (prop.isServerOnly) continue;
		if (body === "") body += "{\n";
		if (!isOptionalPropertiesSection && prop.isOptional) {
			isOptionalPropertiesSection = true;
			body += `    // Optional Properties:\n`;
		}
		body += `    ${prop.propName}${
			prop.exampleValue ? `: ${prop.exampleValue}` : ""
		},\n`;
	}
	if (body !== "") body += "}";

	const authClientMethodPath = pathToDotNotation(path);
	const clientCodeBlock = (
		<DynamicCodeBlock
			code={`${code_prefix}${
				noResult ? "" : "const { data, error } = "
			}await authClient.${authClientMethodPath}(${body});${code_suffix}`}
			lang="ts"
		/>
	);

	const clientTable = <TypeTable props={props} isServer={false} />;

	let serverBody = "";

	let body2 = ``;
	let isOptionalPropertiesSection2 = false;
	let isServerOnlyPropertiesSection = false;
	for (const prop of props) {
		if (body2 === "") body2 += "{\n";
		if (!isOptionalPropertiesSection2 && prop.isOptional) {
			isOptionalPropertiesSection2 = true;
			body2 += `        // Optional Properties:\n`;
		}
		if (!isServerOnlyPropertiesSection && prop.isServerOnly) {
			isServerOnlyPropertiesSection = true;
			body2 += `        // Server Only Properties:\n`;
		}
		body2 += `        ${prop.propName}${
			prop.exampleValue ? `: ${prop.exampleValue}` : ""
		},${prop.isServerOnly && !prop.isOptional ? " // required" : ""}\n`;
	}
	if (body2 !== "") body2 += "    },";

	let fetchOptions = "";
	if (requireSession) {
		fetchOptions +=
			"\n    fetchOptions: {\n        // This endpoint requires session cookies.\n        headers: await headers(),\n    },";
	}

	if (props.length > 0) {
		serverBody += "{\n";
		if (method === "POST") {
			serverBody += `    body: ${body2}${fetchOptions}\n}`;
		} else {
			serverBody += `    query: ${body2}${fetchOptions}\n}`;
		}
	}
	const serverTable = <TypeTable props={props} isServer />;

	const serverCodeBlock = (
		<DynamicCodeBlock
			code={`${code_prefix}${
				noResult ? "" : "const data = "
			}await auth.api.${functionName}(${serverBody});${code_suffix}`}
			lang="ts"
		/>
	);

	return (
		<>
			{isServerOnly ? (
				<>
					<div className="mt-4" />
					{serverCodeBlock}
				</>
			) : (
				<Tabs items={["client", "server"]} className="mb-0 rounded-sm">
					<Tab value="client">
						{clientMessage ? (
							<p className="mb-3 break-words text-wrap">{clientMessage}</p>
						) : null}
						{clientCodeBlock}
						{clientTable}
					</Tab>
					<Tab value="server">
						{serverMessage ? (
							<p className="mb-3 break-words text-wrap">{serverMessage}</p>
						) : null}
						{serverCodeBlock}
						{serverTable}
					</Tab>
				</Tabs>
			)}
			<Endpoint
				method={method || "GET"}
				path={path}
				isServerOnly={typeof isServerOnly === "boolean" ? isServerOnly : false}
				className="-mt-px"
			/>
		</>
	);
};

function pathToDotNotation(input: string): string {
	return input
		.split("/") // split into segments
		.filter(Boolean) // remove empty strings (from leading '/')
		.map((segment) =>
			segment
				.split("-") // split kebab-case
				.map((word, i) =>
					i === 0
						? word.toLowerCase()
						: word.charAt(0).toUpperCase() + word.slice(1),
				)
				.join(""),
		)
		.join(".");
}

function getChildren(
	x:
		| ({ props: { children: string } } | string)
		| ({ props: { children: string } } | string)[],
): string[] {
	if (Array.isArray(x)) {
		const res = [];
		for (const item of x) {
			res.push(getChildren(item));
		}
		return res.flat();
	} else {
		if (typeof x === "string") return [x];
		return [x.props.children];
	}
}

function TypeTable({
	props,
	isServer,
}: { props: Property[]; isServer: boolean }) {
	return (
		<Table className="mt-3 mb-0 overflow-hidden">
			<TableHeader>
				<TableRow>
					<TableHead className="text-primary w-[100px]">Prop</TableHead>
					<TableHead className="text-primary">Description</TableHead>
					<TableHead className="text-primary w-[100px]">Type</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{props.map((prop, i) =>
					prop.isServerOnly && isServer === false ? null : (
						<TableRow key={i}>
							<TableCell>
								<code>
									{prop.propName}
									{prop.isOptional ? "?" : ""}
								</code>
								{prop.isServerOnly ? (
									<span className="mx-2 text-xs text-muted-foreground">
										(server-only)
									</span>
								) : null}
							</TableCell>
							<TableCell className="max-w-[500px] overflow-hidden">
								<div className="w-full h-fit text-wrap break-words ">
									{prop.description}
								</div>
							</TableCell>
							<TableCell>
								<code>{prop.type}</code>
							</TableCell>
						</TableRow>
					),
				)}
			</TableBody>
		</Table>
	);
}

function sortProperties(props: Property[]): Property[] {
	return props.slice().sort((a, b) => {
		const rank = (p: Property) => {
			if (p.isServerOnly) return 2; // Return server only props last
			if (p.isOptional) return 1; // Return optional properties second
			return 0; // Return all required props first.
		};
		return rank(a) - rank(b);
	});
}
