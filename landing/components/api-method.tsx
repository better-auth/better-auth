import { Link } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	ApiMethodTabs,
	ApiMethodTabsContent,
	ApiMethodTabsList,
	ApiMethodTabsTrigger,
} from "./api-method-tabs";
import { Endpoint } from "./endpoint";
import { Button } from "./ui/button";
import { DynamicCodeBlock } from "./ui/dynamic-code-block";

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

const indentationSpace = `    `;

export const APIMethod = ({
	path,
	isServerOnly,
	isClientOnly,
	isExternalOnly,
	method,
	children,
	noResult,
	requireSession,
	requireHeaders,
	requireBearerToken,
	headersComment,
	note,
	clientOnlyNote,
	serverOnlyNote,
	resultVariable = "data",
	forceAsBody,
	forceAsParam,
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
	 *  If enabled, will add a bearer authorization header to the fetch options
	 *
	 * @default false
	 */
	requireBearerToken?: boolean;
	/**
	 * If enabled, we will add `headers` to the fetch options without assuming the request is backed by a session.
	 *
	 * @default false
	 */
	requireHeaders?: boolean;
	/**
	 * A custom comment to display above the generated `headers` line when `requireHeaders` is enabled.
	 */
	headersComment?: string;
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
	 * Wether the code example is client-only, thus meaning it's an endpoint.
	 *
	 * @default false
	 */
	isClientOnly?: boolean;
	/**
	 * Wether the code example is meant for external consumers
	 */
	isExternalOnly?: boolean;
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
	/**
	 * Force the server auth api to use `path`, rather than auto choosing
	 */
	forceAsParam?: boolean;
}) => {
	const { props, functionName, code_prefix, code_suffix } = parseCode(children);

	const authClientMethodPath = pathToDotNotation(path);

	const clientBody = createClientBody({
		props,
		method: method ?? "GET",
		forceAsBody,
		forceAsQuery,
		forceAsParam,
	});

	const serverBody = createServerBody({
		props,
		method: method ?? "GET",
		requireSession: requireSession ?? false,
		requireHeaders: requireHeaders ?? false,
		requireBearerToken: requireBearerToken ?? false,
		headersComment,
		forceAsQuery,
		forceAsParam,
		forceAsBody,
	});

	const serverCodeBlock = (
		<DynamicCodeBlock
			code={`${code_prefix}${
				noResult ? "" : `const ${resultVariable} = `
			}await auth.api.${functionName}(${serverBody});${code_suffix}`}
			lang="ts"
			allowCopy={!isClientOnly}
		/>
	);

	const serverTabContent = (
		<div className="border shadow-sm [&_figure]:my-0 [&_figure]:border-0 [&_figure]:shadow-none [&_figure]:rounded-none [&_.fd-scroll-container]:bg-transparent">
			{isClientOnly || isServerOnly ? null : (
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
		</div>
	);

	if (isExternalOnly) {
		return serverTabContent;
	}

	const pathId = path.replaceAll("/", "-");

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
				<ApiMethodTabsList className="relative flex justify-start w-full p-0 bg-background hover:[&>div>a>button]:opacity-100">
					{(
						[
							{
								value: "client",
								label: "Client",
								icon: (
									<>
										<rect width="20" height="14" x="2" y="3" rx="2" />
										<path d="M8 21h8m-4-4v4" />
									</>
								),
							},
							{
								value: "server",
								label: "Server",
								icon: (
									<>
										<rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
										<rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
										<path d="M6 6h.01M6 18h.01" />
									</>
								),
							},
						] as const
					).map((tab) => (
						<ApiMethodTabsTrigger
							key={tab.value}
							value={tab.value}
							className="transition-all duration-150 ease-in-out max-w-[100px] data-[state=active]:bg-fd-muted/80 hover:bg-fd-secondary/70 bg-background border hover:border-primary/15 cursor-pointer data-[state=active]:border-primary/10 rounded-none dark:bg-[#050505] dark:hover:bg-[#0a0a0a] dark:data-[state=active]:bg-fd-muted/80 dark:border-white/[0.06] dark:hover:border-white/10 dark:data-[state=active]:border-white/10"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1em"
								height="1em"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								{tab.icon}
							</svg>
							<span>{tab.label}</span>
						</ApiMethodTabsTrigger>
					))}
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
					<div className="border shadow-sm [&_figure]:my-0 [&_figure]:border-0 [&_figure]:shadow-none [&_figure]:rounded-none [&_.fd-scroll-container]:bg-transparent">
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
								allowCopy={!isServerOnly}
							/>
							{isServerOnly ? (
								<div className="flex absolute inset-0 justify-center items-center w-full h-full rounded-lg border backdrop-brightness-50 backdrop-blur-xs border-border">
									<span>This is a server-only endpoint</span>
								</div>
							) : null}
						</div>
						{!isServerOnly ? (
							<TypeTable props={props} isServer={false} />
						) : null}
					</div>
				</ApiMethodTabsContent>
				<ApiMethodTabsContent value="server">
					{serverTabContent}
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

	const filteredProps = props.filter(
		(prop) =>
			!(prop.isServerOnly && isServer === false) &&
			!(prop.isClientOnly && isServer === true),
	);

	if (!filteredProps.length) return null;

	return (
		<div className="mt-0">
			<div className="flex items-center gap-2 px-3.5 py-2 border-y border-border bg-fd-muted/80">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-muted-foreground"
				>
					<path d="M16 3h5v5" />
					<path d="M8 3H3v5" />
					<path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
					<path d="m15 9 6-6" />
				</svg>
				<span className="text-xs font-medium text-muted-foreground tracking-wider">
					Parameters
				</span>
			</div>
			<PropertyList props={filteredProps} />
		</div>
	);
}

function PropertyItem({ prop }: { prop: Property }) {
	return (
		<div className="flex items-center gap-2 flex-wrap">
			<code className="text-xs font-semibold text-foreground/90">
				{prop.propName}
			</code>
			<span className="text-xs font-mono text-foreground/60 font-medium">
				{prop.type}
				{prop.isNullable ? " | null" : ""}
			</span>
			{!prop.isOptional && (
				<span className="text-[10px] font-mono font-medium text-amber-600 dark:text-amber-500/80">
					required
				</span>
			)}
			{prop.isServerOnly && (
				<span className="text-[10px] font-mono font-medium text-blue-600 dark:text-blue-400/80">
					server
				</span>
			)}
		</div>
	);
}

function PropertyList({
	props,
	nested = false,
}: {
	props: Property[];
	nested?: boolean;
}) {
	const groups: { prop: Property; children: Property[] }[] = [];
	let i = 0;

	while (i < props.length) {
		const prop = props[i];
		if (prop.type === "Object") {
			const parentPath = [...prop.path, prop.propName].join(".");
			const children: Property[] = [];
			i++;
			while (
				i < props.length &&
				props[i].path.join(".").startsWith(parentPath)
			) {
				children.push(props[i]);
				i++;
			}
			groups.push({ prop, children });
		} else {
			groups.push({ prop, children: [] });
			i++;
		}
	}

	return (
		<div className="divide-y divide-border">
			{groups.map((group) => (
				<div
					key={`${group.prop.path.join(".")}.${group.prop.propName}`}
					className={cn(
						nested ? "px-3 py-3" : "px-3.5 py-3",
						group.children.length > 0 && "pb-3",
					)}
				>
					<PropertyItem prop={group.prop} />
					{group.prop.description && (
						<p className="mt-1 mb-0 text-sm leading-relaxed max-w-xl">
							{tsxifyBackticks(group.prop.description)}
						</p>
					)}
					{group.children.length > 0 && (
						<div className="mt-3 border rounded-md overflow-hidden">
							<PropertyList props={group.children} nested />
						</div>
					)}
				</div>
			))}
		</div>
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

	const props: Property[] = [];

	let functionName: string = "";
	let currentJSDocDescription: string = "";

	let withinApiMethodType = false;
	let hasAlreadyDefinedApiMethodType = false;
	let isServerOnly_ = false;
	let isClientOnly_ = false;
	const nestPath: string[] = []; // str arr segmented-path, eg: ["data", "metadata", "something"]
	const serverOnlyPaths: string[] = []; // str arr full-path, eg: ["data.metadata.something"]
	const clientOnlyPaths: string[] = []; // str arr full-path, eg: ["data.metadata.something"]
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

/**
 * Builds a property line with proper formatting and comments
 */
function buildPropertyLine(
	prop: Property,
	indentLevel: number,
	additionalComments: string[] = [],
): string {
	const comments: string[] = [...additionalComments];
	if (!prop.isOptional) comments.push("required");
	if (prop.comments) comments.push(prop.comments);
	const addComment = comments.length > 0;

	const indent = indentationSpace.repeat(indentLevel);
	const propValue = prop.exampleValue ? `: ${prop.exampleValue}` : "";
	const commentText = addComment ? ` // ${comments.join(", ")}` : "";

	if (prop.type === "Object") {
		// For object types, put comment after the opening brace
		return `${indent}${prop.propName}${propValue}: {${commentText}\n`;
	} else {
		// For non-object types, put comment after the comma
		return `${indent}${prop.propName}${propValue},${commentText}\n`;
	}
}

/**
 * Determines if the client request should use query parameters
 *
 * - GET requests use query params by default, unless `forceAsBody` is true
 * - Any request can be forced to use query params with `forceAsQuery`
 */
function shouldClientUseQueryParams(
	method: string | undefined,
	forceAsBody: boolean | undefined,
	forceAsQuery: boolean | undefined,
	forceAsParam: boolean | undefined,
): boolean {
	if (forceAsQuery) return true;
	if (forceAsBody) return false;
	if (forceAsParam) return false;
	return method === "GET";
}

function createClientBody({
	props,
	method,
	forceAsBody,
	forceAsQuery,
	forceAsParam,
}: {
	props: Property[];
	method?: string;
	forceAsBody?: boolean;
	forceAsQuery?: boolean;
	forceAsParam?: boolean;
}) {
	const isQueryParam = shouldClientUseQueryParams(
		method,
		forceAsBody,
		forceAsQuery,
		forceAsParam,
	);
	const baseIndentLevel = isQueryParam ? 2 : 1;

	let params = ``;

	let i = -1;
	for (const prop of props) {
		i++;
		if (prop.isServerOnly) continue;
		if (params === "") params += "{\n";

		params += buildPropertyLine(prop, prop.path.length + baseIndentLevel);

		if ((props[i + 1]?.path?.length || 0) < prop.path.length) {
			const diff = prop.path.length - (props[i + 1]?.path?.length || 0);

			for (const index of Array(diff)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				params += `${indentationSpace.repeat(index + baseIndentLevel)}},\n`;
			}
		}
	}

	if (params !== "") {
		if (isQueryParam) {
			// Wrap in query object for GET requests and when forceAsQuery is true
			params = `{\n    query: ${params}    },\n}`;
		} else {
			params += "}";
		}
	}

	return params;
}

/**
 * Determines if the server request should use query parameters
 *
 * - GET requests use query params by default, unless `forceAsBody` is true
 * - Other methods (POST, PUT, DELETE) use body by default, unless `forceAsQuery` is true
 */
function shouldServerUseQueryParams(
	method: string,
	forceAsBody: boolean | undefined,
	forceAsQuery: boolean | undefined,
	forceAsParam: boolean | undefined,
): boolean {
	if (forceAsQuery) return true;
	if (forceAsBody) return false;
	if (forceAsParam) return false;
	return method === "GET";
}

function createServerBody({
	props,
	requireSession,
	requireHeaders,
	requireBearerToken,
	headersComment,
	method,
	forceAsBody,
	forceAsParam,
	forceAsQuery,
}: {
	props: Property[];
	requireSession: boolean;
	requireHeaders: boolean;
	requireBearerToken: boolean;
	headersComment: string | undefined;
	method: string;
	forceAsQuery: boolean | undefined;
	forceAsParam: boolean | undefined;
	forceAsBody: boolean | undefined;
}) {
	const isQueryParam = shouldServerUseQueryParams(
		method,
		forceAsBody,
		forceAsQuery,
		forceAsParam,
	);
	const clientOnlyProps = props.filter((x) => !x.isClientOnly);

	// Build properties content
	let propertiesContent = ``;
	let i = -1;

	for (const prop of props) {
		i++;
		if (prop.isClientOnly) continue;
		if (propertiesContent === "") propertiesContent += "{\n";

		// Check if this is a server-only nested property
		const isNestedServerOnlyProp =
			prop.isServerOnly &&
			!(
				prop.path.length &&
				props.find(
					(x) =>
						x.path.join(".") ===
							prop.path.slice(0, prop.path.length - 2).join(".") &&
						x.propName === prop.path[prop.path.length - 1],
				)
			);

		const additionalComments: string[] = [];
		if (isNestedServerOnlyProp) additionalComments.push("server-only");

		propertiesContent += buildPropertyLine(
			prop,
			prop.path.length + 2,
			additionalComments,
		);

		if ((props[i + 1]?.path?.length || 0) < prop.path.length) {
			const diff = prop.path.length - (props[i + 1]?.path?.length || 0);

			for (const index of Array(diff)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				propertiesContent += `${indentationSpace.repeat(index + 2)}},\n`;
			}
		}
	}

	if (propertiesContent !== "") propertiesContent += "    },";

	// Build fetch options
	let fetchOptions = "";
	if (requireSession) {
		fetchOptions +=
			"\n    // This endpoint requires session cookies.\n    headers: await headers(),";
	} else if (requireHeaders) {
		fetchOptions += `\n    // ${
			headersComment ||
			"Pass the current request headers so Better Auth can read and set cookies."
		}\n    headers: await headers(),`;
	}

	if (requireBearerToken) {
		fetchOptions +=
			"\n    // This endpoint requires a bearer authentication token.\n    headers: { authorization: 'Bearer <token>' },";
	}

	// Assemble final result
	let result = "";
	if (clientOnlyProps.length > 0) {
		result += "{\n";
		const paramType = isQueryParam ? "query" : forceAsParam ? "params" : "body";
		result += `    ${paramType}: ${propertiesContent}${fetchOptions}\n}`;
	} else if (fetchOptions.length) {
		result += `{${fetchOptions}\n}`;
	}

	return result;
}

function Note({ children }: { children: ReactNode }) {
	return (
		<div className="flex relative flex-col gap-2 p-3 mb-2 w-full wrap-break-word rounded-md border-b text-md text-wrap bg-fd-muted/80">
			<span className="-mb-1 w-full text-xs select-none text-foreground/80 font-medium">
				Notes
			</span>
			<p className="mt-0 mb-0 text-sm text-fd-muted-foreground">
				{children as any}
			</p>
		</div>
	);
}
