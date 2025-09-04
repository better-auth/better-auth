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
import {
	ApiMethodTabs,
	ApiMethodTabsContent,
	ApiMethodTabsList,
	ApiMethodTabsTrigger,
} from "./api-method-tabs";
import { JSX, ReactNode } from "react";
import { Link } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type Property = {
	isOptional: boolean;
	description: string | null;
	propName: string;
	type: string;
	exampleValue: string | null;
	comments: string | null;
	isServerOnly: boolean;
	path: string[];
	isNullable: boolean;
	isClientOnly: boolean;
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
	isNullable: false,
	isClientOnly: false,
};

export const APIMethod = ({
	path,
	isServerOnly,
	isClientOnly,
	method,
	children,
	noResult,
	requireSession,
	note,
	clientOnlyNote,
	serverOnlyNote,
	resultVariable = "data",
	forceAsBody,
	forceAsQuery,
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
	 * Wether the code example is client-only, thus maening it's an endpoint.
	 *
	 * @default false
	 */
	isClientOnly?: boolean;
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
	/**
	 * The result output variable name.
	 *
	 * @default "data"
	 */
	resultVariable?: string;
	/**
	 * Force the server auth API to use `body`, rather than auto choosing
	 */
	forceAsBody?: boolean;
	/**
	 * Force the server auth API to use `query`, rather than auto choosing
	 */
	forceAsQuery?: boolean;
}) => {
	let { props, functionName, code_prefix, code_suffix } = parseCode(children);

	const authClientMethodPath = pathToDotNotation(path);
	const clientBody = createClientBody({ props });
	const serverBody = createServerBody({
		props,
		method: method ?? "GET",
		requireSession: requireSession ?? false,
		forceAsQuery,
		forceAsBody,
	});

	const serverCodeBlock = (
		<DynamicCodeBlock
			code={`${code_prefix}${
				noResult ? "" : `const ${resultVariable} = `
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
			<ApiMethodTabs
				defaultValue={isServerOnly ? "server" : "client"}
				className="gap-0 w-full"
			>
				<ApiMethodTabsList className="relative flex justify-start w-full p-0 bg-transparent hover:[&>div>a>button]:opacity-100">
					<ApiMethodTabsTrigger
						value="client"
						className="transition-all duration-150 ease-in-out max-w-[100px] data-[state=active]:bg-border hover:bg-border/50 bg-border/50 border hover:border-primary/15 cursor-pointer data-[state=active]:border-primary/10 rounded-none"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="1em"
							height="1em"
							viewBox="0 0 36 36"
						>
							<path
								fill="currentColor"
								d="M23.81 26c-.35.9-.94 1.5-1.61 1.5h-8.46c-.68 0-1.26-.6-1.61-1.5H1v1.75A2.45 2.45 0 0 0 3.6 30h28.8a2.45 2.45 0 0 0 2.6-2.25V26Z"
							/>
							<path
								fill="currentColor"
								d="M7 10h22v14h3V7.57A1.54 1.54 0 0 0 30.5 6h-25A1.54 1.54 0 0 0 4 7.57V24h3Z"
							/>
							<path fill="none" d="M0 0h36v36H0z" />
						</svg>
						<span>Client</span>
					</ApiMethodTabsTrigger>
					<ApiMethodTabsTrigger
						value="server"
						className="transition-all duration-150 ease-in-out max-w-[100px] data-[state=active]:bg-border hover:bg-border/50 bg-border/50 border hover:border-primary/15 cursor-pointer data-[state=active]:border-primary/10 rounded-none"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="1em"
							height="1em"
							viewBox="0 0 24 24"
						>
							<path
								fill="currentColor"
								d="M3 3h18v18H3zm2 2v6h14V5zm14 8H5v6h14zM7 7h2v2H7zm2 8H7v2h2z"
							/>
						</svg>
						<span>Server</span>
					</ApiMethodTabsTrigger>
					<div className="absolute right-0">
						<a href={`#api-method${pathId}`}>
							<Button
								variant="ghost"
								className="opacity-100 transition-all duration-150 ease-in-out scale-90 md:opacity-0"
								size={"icon"}
							>
								<Link className="size-4" />
							</Button>
						</a>
					</div>
				</ApiMethodTabsList>
				<ApiMethodTabsContent value="client">
					{isServerOnly ? null : (
						<Endpoint
							method={method || "GET"}
							path={path}
							isServerOnly={isServerOnly ?? false}
						/>
					)}
					{clientOnlyNote || note ? (
						<Note>
							{note && tsxifyBackticks(note)}
							{clientOnlyNote ? (
								<>
									{note ? <br /> : null}
									{tsxifyBackticks(clientOnlyNote)}
								</>
							) : null}
						</Note>
					) : null}
					<div className={cn("relative w-full")}>
						<DynamicCodeBlock
							code={`${code_prefix}${
								noResult
									? ""
									: `const { data${
											resultVariable === "data" ? "" : `: ${resultVariable}`
										}, error } = `
							}await authClient.${authClientMethodPath}(${clientBody});${code_suffix}`}
							lang="ts"
						/>
						{isServerOnly ? (
							<div className="flex absolute inset-0 justify-center items-center w-full h-full rounded-lg border backdrop-brightness-50 backdrop-blur-xs border-border">
								<span>This is a server-only endpoint</span>
							</div>
						) : null}
					</div>
					{!isServerOnly ? <TypeTable props={props} isServer={false} /> : null}
				</ApiMethodTabsContent>
				<ApiMethodTabsContent value="server">
					{isClientOnly ? null : (
						<Endpoint
							method={method || "GET"}
							path={path}
							isServerOnly={isServerOnly ?? false}
							className=""
						/>
					)}
					{serverOnlyNote || note ? (
						<Note>
							{note && tsxifyBackticks(note)}
							{serverOnlyNote ? (
								<>
									{note ? <br /> : null}
									{tsxifyBackticks(serverOnlyNote)}
								</>
							) : null}
						</Note>
					) : null}
					<div className={cn("relative w-full")}>
						{serverCodeBlock}
						{isClientOnly ? (
							<div className="flex absolute inset-0 justify-center items-center w-full h-full rounded-lg border backdrop-brightness-50 backdrop-blur-xs border-border">
								<span>This is a client-only endpoint</span>
							</div>
						) : null}
					</div>
					{!isClientOnly ? <TypeTable props={props} isServer /> : null}
				</ApiMethodTabsContent>
			</ApiMethodTabs>
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
}: {
	props: Property[];
	isServer: boolean;
}) {
	if (!isServer && !props.filter((x) => !x.isServerOnly).length) return null;
	if (isServer && !props.filter((x) => !x.isClientOnly).length) return null;
	if (!props.length) return null;

	return (
		<Table className="overflow-hidden mt-2 mb-0">
			<TableHeader>
				<TableRow>
					<TableHead className="text-primary w-[100px]">Prop</TableHead>
					<TableHead className="text-primary">Description</TableHead>
					<TableHead className="text-primary w-[100px]">Type</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{props.map((prop, i) =>
					(prop.isServerOnly && isServer === false) ||
					(prop.isClientOnly && isServer === true) ? null : (
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
								<div className="w-full break-words h-fit text-wrap">
									{tsxifyBackticks(prop.description ?? "")}
								</div>
							</TableCell>
							<TableCell className="max-w-[200px] overflow-auto">
								<code>
									{prop.type}
									{prop.isNullable ? " | null" : ""}
								</code>
							</TableCell>
						</TableRow>
					),
				)}
			</TableBody>
		</Table>
	);
}

function tsxifyBackticks(input: string): JSX.Element {
	const parts = input.split(/(`[^`]+`)/g); // Split by backtick sections

	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("`") && part.endsWith("`")) {
					const content = part.slice(1, -1); // remove backticks
					return <code key={index}>{content}</code>;
				} else {
					return <span key={index}>{part}</span>;
				}
			})}
		</>
	);
}

function parseCode(children: JSX.Element) {
	// These two variables are essentially taking the `children` JSX shiki code, and converting them to
	// an array string purely of it's code content.
	const arrayOfJSXCode = children?.props.children.props.children.props.children
		.map((x: any) =>
			x === "\n" ? { props: { children: { props: { children: "\n" } } } } : x,
		)
		.map((x: any) => x.props.children)
		.filter((x: any) => x != null);
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
	let isClientOnly_ = false;
	let nestPath: string[] = []; // str arr segmented-path, eg: ["data", "metadata", "something"]
	let serverOnlyPaths: string[] = []; // str arr full-path, eg: ["data.metadata.something"]
	let clientOnlyPaths: string[] = []; // str arr full-path, eg: ["data.metadata.something"]
	let isNullable = false;

	let code_prefix = "";
	let code_suffix = "";

	for (let line of arrayOfCode) {
		const originalLine = line;
		line = line.trim();
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
				} else if (line.trim() === "@nullable") {
					isNullable = true;
					continue;
				} else if (line.trim() === "@clientOnly") {
					isClientOnly_ = true;
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
				if (isServerOnly_) {
					serverOnlyPaths.push(nestPath.join("."));
				}
				if (isClientOnly_) {
					clientOnlyPaths.push(nestPath.join("."));
				}
			}

			if (clientOnlyPaths.includes(nestPath.join("."))) {
				isClientOnly_ = true;
			}

			if (serverOnlyPaths.includes(nestPath.join("."))) {
				isServerOnly_ = true;
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
				isClientOnly: isClientOnly_,
				path: isTheStartOfNest
					? nestPath.slice(0, nestPath.length - 1)
					: nestPath.slice(),
				isNullable: isNullable,
			};

			isServerOnly_ = false;
			isClientOnly_ = false;
			isNullable = false;
			// console.log(property);
			props.push(property);
		}
	}

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

		if ((props[i + 1]?.path?.length || 0) < prop.path.length) {
			const diff = prop.path.length - (props[i + 1]?.path?.length || 0);

			for (const index of Array(diff)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				body += `${indentationSpace.repeat(index + 1)}},\n`;
			}
		}
	}
	if (body !== "") body += "}";

	return body;
}

function createServerBody({
	props,
	requireSession,
	method,
	forceAsBody,
	forceAsQuery,
}: {
	props: Property[];
	requireSession: boolean;
	method: string;
	forceAsQuery: boolean | undefined;
	forceAsBody: boolean | undefined;
}) {
	let serverBody = "";

	let body2 = ``;

	let i = -1;
	for (const prop of props) {
		i++;
		if (prop.isClientOnly) continue;
		if (body2 === "") body2 += "{\n";

		let addComment = false;
		let comment: string[] = [];

		if (!prop.isOptional || prop.comments) {
			addComment = true;
		}

		if (
			prop.isServerOnly &&
			!(
				prop.path.length &&
				props.find(
					(x) =>
						x.path.join(".") ===
							prop.path.slice(0, prop.path.length - 2).join(".") &&
						x.propName === prop.path[prop.path.length - 1],
				)
			)
		) {
			comment.push("server-only");
			addComment = true;
		}
		if (!prop.isOptional) comment.push("required");
		if (prop.comments) comment.push(prop.comments);

		body2 += `${indentationSpace.repeat(prop.path.length + 2)}${prop.propName}${
			prop.exampleValue ? `: ${prop.exampleValue}` : ""
		}${prop.type === "Object" ? ": {" : ","}${
			addComment ? ` // ${comment.join(", ")}` : ""
		}\n`;
		if ((props[i + 1]?.path?.length || 0) < prop.path.length) {
			const diff = prop.path.length - (props[i + 1]?.path?.length || 0);

			for (const index of Array(diff)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				body2 += `${indentationSpace.repeat(index + 2)}},\n`;
			}
		}
	}
	if (body2 !== "") body2 += "    },";

	let fetchOptions = "";
	if (requireSession) {
		fetchOptions +=
			"\n    // This endpoint requires session cookies.\n    headers: await headers(),";
	}

	if (props.filter((x) => !x.isClientOnly).length > 0) {
		serverBody += "{\n";
		if ((method === "POST" || forceAsBody) && !forceAsQuery) {
			serverBody += `    body: ${body2}${fetchOptions}\n}`;
		} else {
			serverBody += `    query: ${body2}${fetchOptions}\n}`;
		}
	} else if (fetchOptions.length) {
		serverBody += `{${fetchOptions}\n}`;
	}
	return serverBody;
}

function Note({ children }: { children: ReactNode }) {
	return (
		<div className="flex relative flex-col gap-2 p-3 mb-2 w-full break-words rounded-md border text-md text-wrap border-border bg-fd-secondary/50">
			<span className="-mb-1 w-full text-xs select-none text-muted-foreground">
				Notes
			</span>
			<p className="mt-0 mb-0 text-sm">{children as any}</p>
		</div>
	);
}
