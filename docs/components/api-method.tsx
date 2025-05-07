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
};

export const APIMethod = ({
	path,
	fetchOptions,
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
	 * Fetch options to include in the API call.
	 */
	fetchOptions?: Record<string, any>;
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

	const props: Property[] = [];

	const placeholderProperty: Property = {
		isOptional: false,
		comments: null,
		description: null,
		exampleValue: null,
		propName: "",
		type: "",
	};

	let functionName: string = "";
	let currentJSDocDescription: string = "";

	let withinApiMethodType = false;
	let hasAlreadyDefinedApiMethodType = false;

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
                if(line === "*" || line === "* ") continue;
				currentJSDocDescription += line.replace("* ", "") + " ";
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
				.replace("=", " ")
				.split(" ")
				.filter((x) => x !== "")[0];
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
			};

			console.log(property);
			props.push(property);
		}
	}

	let body = ``;
	for (const prop of props) {
		if (body === "") body += "{\n";
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

	const clientTable = <TypeTable props={props} />;

	let serverBody = "";

	let body2 = ``;
	for (const prop of props) {
		if (body2 === "") body2 += "{\n";
		body2 += `        ${prop.propName}${
			prop.exampleValue ? `: ${prop.exampleValue}` : ""
		},\n`;
	}
	if (body2 !== "") body2 += "    },";

	if (props.length > 0) {
		serverBody += "{\n";
		if (method === "POST") {
			serverBody += `    body: ${body2}\n}`;
		} else {
			serverBody += `    query: ${body2}\n}`;
		}
	}
	const serverTable = <TypeTable props={props} />;

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
			<Endpoint
				method={method || "GET"}
				path={path}
				isServerOnly={typeof isServerOnly === "boolean" ? isServerOnly : false}
				className="mt-4"
			/>
			{isServerOnly ? (
				<>
					<div className="mt-4" />
					{serverCodeBlock}
				</>
			) : (
				<Tabs items={["client", "server"]} className="rounded-sm">
					<Tab value="client">
						{clientMessage ? <p className="mb-3 break-words text-wrap">{clientMessage}</p> : null}
						{clientCodeBlock}
						{clientTable}
					</Tab>
					<Tab value="server">
						{serverMessage ? <p className="mb-3 break-words text-wrap">{serverMessage}</p> : null}
						{serverCodeBlock}
						{serverTable}
					</Tab>
				</Tabs>
			)}
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

function TypeTable({ props }: { props: Property[] }) {
	return (
		<Table className="mt-3 mb-0">
			<TableHeader>
				<TableRow>
					<TableHead className="text-primary w-[100px]">Prop</TableHead>
					<TableHead className="text-primary">Description</TableHead>
					<TableHead className="text-primary w-[100px]">Type</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{props.map((prop, i) => (
					<TableRow key={i}>
						<TableCell>
							<code>{prop.propName}</code>
							{prop.isOptional ? (
								<span className="mx-2 text-xs text-muted-foreground">
									(optional)
								</span>
							) : null}
						</TableCell>
						<TableCell>{prop.description}</TableCell>
						<TableCell>
							<code>{prop.type}</code>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
