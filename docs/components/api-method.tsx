import { Endpoint } from "./endpoint";
// import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ReactNode } from "react";
import { Link } from "lucide-react";
import { Button } from "./ui/button";

type Property = {
	isOptional: boolean;
	description: string | null;
	propName: string;
	type: string;
	exampleValue: string | null;
	comments: string | null;
	isServerOnly: boolean;
	path: string[];
};

const placeholderProperty: Property = {
	isOptional: false,
	comments: null,
	description: null,
	exampleValue: null,
	propName: "",
	type: "",
	isServerOnly: false,
	path: [],
};

export const APIMethod = ({
	path,
	isServerOnly,
	method,
	children,
	noResult,
	requireSession,
	note,
	clientOnlyNote,
	serverOnlyNote,
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
	 * A small note to display above the client-auth example code-block.
	 */
	clientOnlyNote?: string;
	/**
	 * A small note to display above the server-auth example code-block.
	 */
	serverOnlyNote?: string;
	/**
	 * A small note to display above both the client & server auth example code-blocks.
	 */
	note?: string;
}) => {
	let { props, functionName, code_prefix, code_suffix } = parseCode(children);

	const authClientMethodPath = pathToDotNotation(path);
	const clientBody = createClientBody({ props });
	const serverBody = createServerBody({
		props,
		method: method ?? "GET",
		requireSession: requireSession ?? false,
	});

	const serverCodeBlock = (
		<DynamicCodeBlock
			code={`${code_prefix}${
				noResult ? "" : "const data = "
			}await auth.api.${functionName}(${serverBody});${code_suffix}`}
			lang="ts"
		/>
	);

	let pathId = path.replaceAll("/", "-");

	return (
		<>
			<div className="relative">
				<div
					id={`api-method${pathId}`}
					aria-hidden
					className="absolute invisible -top-[100px]"
				/>
			</div>
			<Tabs defaultValue="client" className="w-full gap-0">
				<TabsList className="relative flex justify-start w-full gap-2 p-0 mb-1 bg-transparent hover:[&>div>a>button]:opacity-100">
					<TabsTrigger
						value="client"
						className="transition-all duration-150 ease-in-out max-w-[100px] data-[state=active]:bg-border hover:bg-border/80 bg-border/50 border hover:border-primary/15 cursor-pointer data-[state=active]:border-primary/30"
					>
						client
					</TabsTrigger>
					<TabsTrigger
						value="server"
						className="transition-all duration-150 ease-in-out max-w-[100px] data-[state=active]:bg-border hover:bg-border/80 bg-border/50 border hover:border-primary/15 cursor-pointer data-[state=active]:border-primary/30"
					>
						server
					</TabsTrigger>
					<div className="absolute right-0">
						<a href={`#api-method${pathId}`}>
							<Button
								variant="ghost"
								className="transition-all duration-150 ease-in-out scale-90 opacity-100 md:opacity-0"
								size={"icon"}
							>
								<Link className="size-4" />
							</Button>
						</a>
					</div>
				</TabsList>
				<TabsContent value="client" className="">
					<Endpoint
						method={method || "GET"}
						path={path}
						isServerOnly={isServerOnly ?? false}
						className="mt-0.5 mb-2"
					/>
					{clientOnlyNote || note ? (
						<Note>
							{note}
							{clientOnlyNote ? (
								<>
									<br />
									{clientOnlyNote}
								</>
							) : null}
						</Note>
					) : null}
					<DynamicCodeBlock
						code={`${code_prefix}${
							noResult ? "" : "const { data, error } = "
						}await authClient.${authClientMethodPath}(${clientBody});${code_suffix}`}
						lang="ts"
					/>
					<TypeTable props={props} isServer={false} />
				</TabsContent>
				<TabsContent value="server">
					<Endpoint
						method={method || "GET"}
						path={path}
						isServerOnly={isServerOnly ?? false}
						className="mt-0.5 mb-2"
					/>
					{serverOnlyNote || note ? (
						<Note>
							{note}
							{serverOnlyNote ? (
								<>
									<br />
									{serverOnlyNote}
								</>
							) : null}
						</Note>
					) : null}
					{serverCodeBlock}
					<TypeTable props={props} isServer />
				</TabsContent>
			</Tabs>
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
		<Table className="mt-2 mb-0 overflow-hidden">
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
									{prop.path.join(".") + (prop.path.length ? "." : "")}
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
								<div className="w-full break-words h-fit text-wrap ">
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

function parseCode(children: JSX.Element) {
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

	let functionName: string = "";
	let currentJSDocDescription: string = "";

	let withinApiMethodType = false;
	let hasAlreadyDefinedApiMethodType = false;
	let isServerOnly_ = false;
	let nestPath: string[] = [];

	let code_prefix = "";
	let code_suffix = "";
	console.log(`\n\n\n\n\n\n\n\n\n\n=================================`);

	for (let line of arrayOfCode) {
		const originalLine = line;
		line = line.trim();
		console.log(`${line}`);
		if (line === "}" && withinApiMethodType && !nestPath.length) {
			withinApiMethodType = false;
			hasAlreadyDefinedApiMethodType = true;
			continue;
		} else {
			if (line === "}" && withinApiMethodType && nestPath.length) {
				nestPath.pop();
				continue;
			}
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
			let propType = line
				.replace(propName, "")
				.replace("?", "")
				.replace(":", "")
				.split("=")[0]
				.trim()!;

			let isTheStartOfNest = false;
			if (propType === "{") {
				// This means that it's a nested object.
				propType = `Object`;
				isTheStartOfNest = true;
				nestPath.push(propName);
			}

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
				path: isTheStartOfNest
					? nestPath.slice(0, nestPath.length - 1)
					: nestPath.slice(),
			};

			if (isServerOnly_ === true) isServerOnly_ = false;
			console.log(property);
			props.push(property);
		}
	}

	console.log(`\n\n\n\n\n\n\n\n\n\n=================================`);

	return {
		functionName,
		props,
		code_prefix,
		code_suffix,
	};
}

const indentationSpace = `    `;

function createClientBody({ props }: { props: Property[] }) {
	let body = ``;
	let currentIndentation = 0;

	let i = -1;
	for (const prop of props) {
		i++;
		if (prop.isServerOnly) continue;
		if (body === "") body += "{\n";

		let addComment = false;
		let comment: string[] = [];
		if (!prop.isOptional || prop.comments) addComment = true;

		if (!prop.isOptional) comment.push("required");
		if (prop.comments) comment.push(prop.comments);

		body += `${indentationSpace.repeat(prop.path.length + 1)}${prop.propName}${
			prop.exampleValue ? `: ${prop.exampleValue}` : ""
		}${prop.type === "Object" ? ": {" : ","}${
			addComment ? ` // ${comment.join(", ")}` : ""
		}\n`;
		if (!props[i + 1] || props[i + 1].path.length < currentIndentation) {
			for (const index of Array(prop.path.length)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				body += `${indentationSpace.repeat(index + 1)}},\n`;
			}
		}
		currentIndentation = prop.path.length;
	}
	if (body !== "") body += "}";

	return body;
}

function createServerBody({
	props,
	requireSession,
	method,
}: { props: Property[]; requireSession: boolean; method: string }) {
	let serverBody = "";

	let body2 = ``;
	let currentIndentation = 0;

	let i = -1;
	for (const prop of props) {
		i++;
		if (body2 === "") body2 += "{\n";

		let addComment = false;
		let comment: string[] = [];
		if (!prop.isOptional || prop.comments || prop.isServerOnly)
			addComment = true;

		if (prop.isServerOnly) comment.push("server-only");
		if (!prop.isOptional) comment.push("required");
		if (prop.comments) comment.push(prop.comments);

		body2 += `${indentationSpace.repeat(prop.path.length + 2)}${prop.propName}${
			prop.exampleValue ? `: ${prop.exampleValue}` : ""
		}${prop.type === "Object" ? ": {" : ","}${
			addComment ? ` // ${comment.join(", ")}` : ""
		}\n`;
		if (!props[i + 1] || props[i + 1].path.length < currentIndentation) {
			for (const index of Array(prop.path.length)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				body2 += `${indentationSpace.repeat(index + 2)}},\n`;
			}
		}
		currentIndentation = prop.path.length;
	}
	if (body2 !== "") body2 += "    },";

	let fetchOptions = "";
	if (requireSession) {
		fetchOptions +=
			"\n    // This endpoint requires session cookies.\n    headers: await headers(),";
	}

	if (props.length > 0) {
		serverBody += "{\n";
		if (method === "POST") {
			serverBody += `    body: ${body2}${fetchOptions}\n}`;
		} else {
			serverBody += `    query: ${body2}${fetchOptions}\n}`;
		}
	}
	return serverBody;
}

function Note({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex flex-col w-full gap-2 p-3 mb-2 break-words border rounded-md text-md text-wrap border-border bg-fd-secondary/50">
			<span className="w-full -mb-2 text-xs select-none text-muted-foreground">
				Notes
			</span>
			<p className="mt-0 mb-0">{children as any}</p>
		</div>
	);
}
