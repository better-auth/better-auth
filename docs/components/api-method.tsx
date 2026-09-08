import { Link } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { Children, isValidElement } from "react";
import type { ApiMethodOptions, ApiMethodProperty } from "@/lib/api-method";
import { generateApiMethodExamples, parseApiMethod } from "@/lib/api-method";
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

const apiMethodTabs = [
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
] as const;

export function APIMethod({
	children,
	...options
}: ApiMethodOptions & { children: ReactNode }) {
	const {
		path,
		method,
		isServerOnly,
		isClientOnly,
		isExternalOnly,
		note,
		clientOnlyNote,
		serverOnlyNote,
	} = options;
	const definition = parseApiMethod(getTextContent(children));
	const examples = generateApiMethodExamples(definition, options);
	const properties = definition.properties;

	const serverTabContent = (
		<div className="border shadow-sm [&_figure]:my-0 [&_figure]:border-0 [&_figure]:shadow-none [&_figure]:rounded-none [&_.fd-scroll-container]:bg-transparent">
			{isClientOnly || isServerOnly ? null : (
				<Endpoint method={method ?? "GET"} path={path} />
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
			<div className="relative w-full">
				<DynamicCodeBlock
					code={examples.server}
					lang="ts"
					allowCopy={!isClientOnly}
				/>
				{isClientOnly ? (
					<div className="flex absolute inset-0 justify-center items-center w-full h-full rounded-lg border backdrop-brightness-50 backdrop-blur-xs border-border">
						<span>This is a client-only endpoint</span>
					</div>
				) : null}
			</div>
			{!isClientOnly ? <TypeTable properties={properties} isServer /> : null}
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
					{apiMethodTabs.map((tab) => (
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
								size="icon"
							>
								<Link className="size-4" />
							</Button>
						</a>
					</div>
				</ApiMethodTabsList>
				<ApiMethodTabsContent value="client">
					<div className="border shadow-sm [&_figure]:my-0 [&_figure]:border-0 [&_figure]:shadow-none [&_figure]:rounded-none [&_.fd-scroll-container]:bg-transparent">
						{isServerOnly ? null : (
							<Endpoint method={method ?? "GET"} path={path} />
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
						<div className="relative w-full">
							<DynamicCodeBlock
								code={examples.client}
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
							<TypeTable properties={properties} isServer={false} />
						) : null}
					</div>
				</ApiMethodTabsContent>
				<ApiMethodTabsContent value="server">
					{serverTabContent}
				</ApiMethodTabsContent>
			</ApiMethodTabs>
		</>
	);
}

function getTextContent(node: ReactNode): string {
	return Children.toArray(node)
		.map((child) =>
			isValidElement<{ children?: ReactNode }>(child)
				? getTextContent(child.props.children)
				: String(child),
		)
		.join("");
}

function TypeTable({
	properties,
	isServer,
}: {
	properties: ApiMethodProperty[];
	isServer: boolean;
}) {
	const visibleProperties = properties.filter(
		(property) =>
			!(property.serverOnly && isServer === false) &&
			!(property.clientOnly && isServer === true),
	);

	if (!visibleProperties.length) return null;

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
			<PropertyList properties={visibleProperties} />
		</div>
	);
}

function PropertyItem({ property }: { property: ApiMethodProperty }) {
	return (
		<div className="flex items-center gap-2 flex-wrap">
			<code className="text-xs font-semibold text-foreground/90">
				{property.name}
			</code>
			<span className="text-xs font-mono text-foreground/60 font-medium">
				{property.type}
				{property.nullable ? " | null" : ""}
			</span>
			{!property.optional && (
				<span className="text-[10px] font-mono font-medium text-amber-600 dark:text-amber-500/80">
					required
				</span>
			)}
			{property.serverOnly && (
				<span className="text-[10px] font-mono font-medium text-blue-600 dark:text-blue-400/80">
					server
				</span>
			)}
		</div>
	);
}

function PropertyList({
	properties,
	nested = false,
}: {
	properties: ApiMethodProperty[];
	nested?: boolean;
}) {
	const groups: {
		property: ApiMethodProperty;
		children: ApiMethodProperty[];
	}[] = [];
	let propertyIndex = 0;

	while (propertyIndex < properties.length) {
		const property = properties[propertyIndex];
		if (property.type === "Object") {
			const parentSegments = [...property.path, property.name];
			const children: ApiMethodProperty[] = [];
			propertyIndex++;
			while (
				propertyIndex < properties.length &&
				properties[propertyIndex].path.length >= parentSegments.length &&
				parentSegments.every(
					(segment, index) => properties[propertyIndex].path[index] === segment,
				)
			) {
				children.push(properties[propertyIndex]);
				propertyIndex++;
			}
			groups.push({ property, children });
		} else {
			groups.push({ property, children: [] });
			propertyIndex++;
		}
	}

	return (
		<div className="divide-y divide-border">
			{groups.map((group) => (
				<div
					key={`${group.property.path.join(".")}.${group.property.name}`}
					className={cn(
						nested ? "px-3 py-3" : "px-3.5 py-3",
						group.children.length > 0 && "pb-3",
					)}
				>
					<PropertyItem property={group.property} />
					{group.property.description && (
						<p className="mt-1 mb-0 text-sm leading-relaxed max-w-xl">
							{tsxifyBackticks(group.property.description)}
						</p>
					)}
					{group.children.length > 0 && (
						<div className="mt-3 border rounded-md overflow-hidden">
							<PropertyList properties={group.children} nested />
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function tsxifyBackticks(input: string): JSX.Element {
	const parts = input.split(/(`[^`]+`)/g);

	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("`") && part.endsWith("`")) {
					const content = part.slice(1, -1);
					return <code key={index}>{content}</code>;
				}
				return <span key={index}>{part}</span>;
			})}
		</>
	);
}

function Note({ children }: { children: ReactNode }) {
	return (
		<div className="flex relative flex-col gap-2 p-3 mb-2 w-full wrap-break-word rounded-md border-b text-md text-wrap bg-fd-muted/80">
			<span className="-mb-1 w-full text-xs select-none text-foreground/80 font-medium">
				Notes
			</span>
			<p className="mt-0 mb-0 text-sm text-fd-muted-foreground">{children}</p>
		</div>
	);
}
