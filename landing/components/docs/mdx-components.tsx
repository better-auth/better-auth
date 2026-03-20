"use client";

import { ExternalLink, Key, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { DynamicCodeBlock } from "@/components/ui/dynamic-code-block";
import type {
	DBFieldAttribute,
	DBSchema,
	DefaultDialects,
} from "@/lib/copy-schema";
import { copySchema } from "@/lib/copy-schema";
import { drizzleResolver } from "@/lib/copy-schema/adapter/drizzle";
import { prismaResolver } from "@/lib/copy-schema/adapter/prisma";
import { cn } from "@/lib/utils";

// ─── GenerateSecret ──────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let result = "";
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	for (let i = 0; i < length; i++) {
		result += chars[array[i] % chars.length];
	}
	return result;
}

export function GenerateSecret() {
	const [generated, setGenerated] = useState(false);
	return (
		<div className="my-2">
			<Button
				variant="outline"
				size="sm"
				disabled={generated}
				onClick={() => {
					const elements = document.querySelectorAll("pre code span.line span");
					for (let i = 0; i < elements.length; i++) {
						if (elements[i].textContent === "BETTER_AUTH_SECRET=") {
							elements[i].textContent =
								`BETTER_AUTH_SECRET=${generateRandomString(32)}`;
							setGenerated(true);
							setTimeout(() => {
								elements[i].textContent = "BETTER_AUTH_SECRET=";
								setGenerated(false);
							}, 5000);
						}
					}
				}}
			>
				{generated ? "Generated" : "Generate Secret"}
			</Button>
		</div>
	);
}

// ─── APIMethod ───────────────────────────────────────────────────────────────

export function APIMethod({
	children,
	path,
	method = "GET",
}: {
	children?: ReactNode;
	path?: string;
	method?: string;
	[key: string]: unknown;
}) {
	return (
		<div className="my-4 rounded-lg border bg-card p-4">
			{path && (
				<div className="mb-3 flex items-center gap-2 font-mono text-sm">
					<span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase text-primary">
						{method}
					</span>
					<span className="text-muted-foreground/80">{path}</span>
				</div>
			)}
			<div className="prose-sm">{children}</div>
		</div>
	);
}

// ─── DatabaseTable ───────────────────────────────────────────────────────────

interface Field {
	name: string;
	type: string;
	description: string;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	isOptional?: boolean;
	isUnique?: boolean;
}

const typeAliases: Record<string, string> = {
	text: "string",
	integer: "number",
	int: "number",
	bigint: "number",
	float: "number",
	double: "number",
	decimal: "number",
	bool: "boolean",
	object: "json",
	timestamp: "date",
	datetime: "date",
};

function TypeIcon({ type }: { type: string }) {
	const raw = type.toLowerCase().replace("[]", "");
	const t = typeAliases[raw] ?? raw;
	const className = "size-3 shrink-0";

	if (t === "string" || t === "text") {
		// Text/type icon
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={cn(className, "text-emerald-600")}
			>
				<path d="M4 7V4h16v3" />
				<path d="M9 20h6" />
				<path d="M12 4v16" />
			</svg>
		);
	}
	if (t === "boolean") {
		// Toggle icon
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={cn(className, "text-violet-600 dark:text-violet-500")}
			>
				<rect width="20" height="12" x="2" y="6" rx="6" />
				<circle cx="16" cy="12" r="2" />
			</svg>
		);
	}
	if (t === "date") {
		// Calendar icon
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={cn(className, "text-sky-600")}
			>
				<path d="M8 2v4" />
				<path d="M16 2v4" />
				<rect width="18" height="18" x="3" y="4" rx="2" />
				<path d="M3 10h18" />
			</svg>
		);
	}
	if (t === "number") {
		// Hash icon
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={cn(className, "text-orange-500 dark:text-orange-600")}
			>
				<path d="M4 9h16" />
				<path d="M4 15h16" />
				<path d="M10 3L8 21" />
				<path d="M16 3l-2 18" />
			</svg>
		);
	}
	// Fallback — braces icon for object/json/other
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cn(className, "text-foreground/40")}
		>
			<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
			<path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
		</svg>
	);
}

type ViewMode = "table" | "sql" | "prisma" | "drizzle";
type SQLDialect = DefaultDialects;
type DrizzleProvider = "pg" | "mysql" | "sqlite";

function fieldToDBField(field: Field): DBFieldAttribute {
	const t = field.type.toLowerCase();
	const isArray = t.endsWith("[]");
	const raw = isArray ? t.slice(0, -2) : t;
	const aliased = typeAliases[raw] ?? raw;
	const type = (
		isArray && (aliased === "string" || aliased === "number")
			? `${aliased}[]`
			: isArray
				? t
				: aliased
	) as DBFieldAttribute["type"];
	const bigint = raw === "bigint";

	let references: DBFieldAttribute["references"] | undefined;
	if (field.isForeignKey && field.name.endsWith("Id")) {
		references = {
			model: field.name.slice(0, -2),
			field: "id",
			onDelete: "cascade",
		};
	}

	return {
		fieldName: field.name,
		type,
		required: field.isPrimaryKey ? true : !field.isOptional,
		references,
		unique: field.isUnique ?? false,
		bigint,
	};
}

function generateSchema(
	tableName: string,
	fields: Field[],
	view: ViewMode,
	sqlDialect: SQLDialect,
	drizzleProvider: DrizzleProvider,
): string {
	const schema: DBSchema<false> = {
		modelName: tableName,
		fields: fields.map(fieldToDBField),
	};

	if (view === "sql") {
		return copySchema(schema, { dialect: sqlDialect, mode: "create" }).result;
	}
	if (view === "prisma") {
		return copySchema(schema, {
			dialect: prismaResolver({}),
			mode: "create",
		}).result;
	}
	if (view === "drizzle") {
		return copySchema(schema, {
			dialect: drizzleResolver({ provider: drizzleProvider }),
			mode: "create",
		}).result;
	}
	return "";
}

function SchemaCodeBlock({ code, lang }: { code: string; lang: string }) {
	return (
		<div className="[&_figure]:my-0 [&_figure]:border-0 [&_figure]:rounded-none [&_pre]:text-[13px]">
			<DynamicCodeBlock code={code} lang={lang} allowCopy />
		</div>
	);
}

const sqlDialects: { key: SQLDialect; label: string }[] = [
	{ key: "postgresql", label: "PostgreSQL" },
	{ key: "mysql", label: "MySQL" },
	{ key: "sqlite", label: "SQLite" },
	{ key: "mssql", label: "MSSQL" },
];

const drizzleProviders: { key: DrizzleProvider; label: string }[] = [
	{ key: "pg", label: "PostgreSQL" },
	{ key: "mysql", label: "MySQL" },
	{ key: "sqlite", label: "SQLite" },
];

export function DatabaseTable({
	fields,
	name,
}: {
	fields: Field[];
	name?: string;
}) {
	const [view, setView] = useState<ViewMode>("table");
	const [sqlDialect, setSqlDialect] = useState<SQLDialect>("postgresql");
	const [drizzleProvider, setDrizzleProvider] = useState<DrizzleProvider>("pg");
	const tableName = name || "table";

	return (
		<div className="my-4 border shadow-sm overflow-hidden dark:bg-[#030303]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 border-b">
				<div className="flex items-center gap-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-foreground/60"
					>
						<ellipse cx="12" cy="5" rx="9" ry="3" />
						<path d="M3 5v14a9 3 0 0 0 18 0V5" />
						<path d="M3 12a9 3 0 0 0 18 0" />
					</svg>
					{name ? (
						<span className="font-mono text-[13px] text-foreground/80">
							<span className="text-foreground/40">table </span>
							{name}
						</span>
					) : (
						<span className="text-xs text-foreground/60 font-mono font-medium uppercase tracking-wider">
							Table
						</span>
					)}
				</div>
				<div className="flex items-center">
					{(
						[
							{ key: "table", label: "Table" },
							{ key: "sql", label: "SQL" },
							{ key: "prisma", label: "Prisma" },
							{ key: "drizzle", label: "Drizzle" },
						] as const
					).map((opt) => (
						<button
							key={opt.key}
							type="button"
							onClick={() => startTransition(() => setView(opt.key))}
							className={cn(
								"relative px-2 py-0.5 font-mono text-xs font-medium transition-colors cursor-pointer",
								view === opt.key
									? "text-foreground/80"
									: "text-foreground/40 hover:text-foreground/60",
							)}
						>
							{opt.label}
							{view === opt.key && (
								<span className="absolute inset-x-2 -bottom-2 h-[1.5px] bg-foreground/80" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* Sub-selector for SQL dialect or Drizzle provider */}
			{view === "sql" && (
				<div className="flex items-center px-4 py-1 border-b">
					{sqlDialects.map((d) => (
						<button
							key={d.key}
							type="button"
							onClick={() => startTransition(() => setSqlDialect(d.key))}
							className={cn(
								"relative px-1.5 py-1 font-mono text-xs font-medium transition-colors cursor-pointer",
								sqlDialect === d.key
									? "text-foreground/80"
									: "text-foreground/40 hover:text-foreground/60",
							)}
						>
							{d.label}
							{sqlDialect === d.key && (
								<span className="absolute inset-x-1.5 -bottom-1 h-[1.5px] bg-foreground/80" />
							)}
						</button>
					))}
				</div>
			)}
			{view === "drizzle" && (
				<div className="flex items-center px-4 py-1 border-b">
					{drizzleProviders.map((d) => (
						<button
							key={d.key}
							type="button"
							onClick={() => startTransition(() => setDrizzleProvider(d.key))}
							className={cn(
								"relative px-1.5 py-1 font-mono text-xs font-medium transition-colors cursor-pointer",
								drizzleProvider === d.key
									? "text-foreground/80"
									: "text-foreground/40 hover:text-foreground/60",
							)}
						>
							{d.label}
							{drizzleProvider === d.key && (
								<span className="absolute inset-x-1.5 -bottom-1 h-[1.5px] bg-foreground/80" />
							)}
						</button>
					))}
				</div>
			)}

			{view === "table" ? (
				<div className="overflow-x-auto">
					{/* Column headers */}
					<div className="grid grid-cols-[minmax(160px,1.2fr)_minmax(100px,0.8fr)_minmax(40px,0.4fr)_minmax(150px,2fr)] min-w-[600px] border-b bg-foreground/2">
						{["Field", "Type", "Key", "Description"].map((label) => (
							<div
								key={label}
								className="px-4 py-1 text-[11px] font-mono font-medium uppercase tracking-wider text-foreground/60"
							>
								{label}
							</div>
						))}
					</div>

					{/* Rows */}
					{fields.map((field) => (
						<div
							key={field.name}
							className="grid grid-cols-[minmax(160px,1.2fr)_minmax(100px,0.8fr)_minmax(40px,0.4fr)_minmax(150px,2fr)] min-w-[600px] items-center border-b border-dashed border-foreground/10 last:border-b-0 hover:bg-foreground/[0.02] transition-colors"
						>
							<div className="px-4 py-2 font-mono text-[13px] text-foreground/80 break-all">
								{field.name}
							</div>
							<div className="px-4 py-2 flex items-center gap-1.5">
								<TypeIcon type={field.type} />
								<span className="font-mono text-[13px] text-foreground/80">
									{field.type}
								</span>
							</div>
							<div className="px-4 py-2">
								{field.isPrimaryKey && (
									<span className="inline-flex items-center gap-1 font-mono text-[13px] text-amber-600 dark:text-amber-500 uppercase">
										<Key className="size-2.5" />
										PK
									</span>
								)}
								{field.isForeignKey && (
									<span className="inline-flex items-center gap-1 font-mono text-[13px] text-blue-600 dark:text-blue-400 uppercase">
										<LinkIcon className="size-2.5" />
										FK
									</span>
								)}
								{field.isOptional && (
									<span className="font-mono text-[13px] text-foreground/60 uppercase">
										?
									</span>
								)}
								{!field.isPrimaryKey &&
									!field.isForeignKey &&
									!field.isOptional && (
										<span className="text-foreground/20 uppercase">-</span>
									)}
							</div>
							<div className="px-4 py-2 text-[13px] text-foreground/70 leading-relaxed">
								{field.description}
							</div>
						</div>
					))}
				</div>
			) : (
				<SchemaCodeBlock
					code={generateSchema(
						tableName,
						fields,
						view,
						sqlDialect,
						drizzleProvider,
					)}
					lang={
						view === "sql" ? "sql" : view === "prisma" ? "prisma" : "typescript"
					}
				/>
			)}
		</div>
	);
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

function Method({ method }: { method: string }) {
	return (
		<div className="flex items-center justify-center h-6 px-2 text-sm font-semibold uppercase border rounded-lg select-none w-fit font-display bg-background">
			{method}
		</div>
	);
}

export function Endpoint({
	path,
	method = "GET",
	isServerOnly,
	className,
}: {
	path?: string;
	method?: string;
	isServerOnly?: boolean;
	className?: string;
	[key: string]: unknown;
}) {
	return (
		<div
			className={cn(
				"relative flex items-center w-full gap-2 p-2 border-t border-x border-border bg-fd-secondary/50 group",
				className,
			)}
		>
			<Method method={method || "GET"} />
			<span className="font-mono text-sm text-muted-foreground/80">{path}</span>
		</div>
	);
}

// ─── ForkButton ──────────────────────────────────────────────────────────────

export function ForkButton({ url }: { url: string }) {
	return (
		<div className="flex items-center gap-2 my-2">
			<Link href={`https://codesandbox.io/p/github/${url}`} target="_blank">
				<Button className="gap-2" variant="outline" size="sm">
					<ExternalLink size={12} />
					Open in Stackblitz
				</Button>
			</Link>
			<Link href={`https://github.com/${url}`} target="_blank">
				<Button className="gap-2" variant="secondary" size="sm">
					<svg
						viewBox="0 0 15 15"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						className="size-4"
					>
						<path
							d="M7.49933 0.25C3.49635 0.25 0.25 3.49593 0.25 7.50024C0.25 10.703 2.32715 13.4206 5.2081 14.3797C5.57084 14.446 5.70302 14.2222 5.70302 14.0299C5.70302 13.8576 5.69679 13.4019 5.69323 12.797C3.67661 13.235 3.2535 11.825 3.2535 11.825C2.92712 10.9874 2.44043 10.7644 2.44043 10.7644C1.78599 10.3149 2.49182 10.3238 2.49182 10.3238C3.21508 10.375 3.59424 11.0711 3.59424 11.0711C4.23413 12.1788 5.30261 11.8588 5.71489 11.6732C5.78126 11.2058 5.96378 10.8862 6.16528 10.7046C4.5544 10.5209 2.85929 9.89918 2.85929 7.12104C2.85929 6.32925 3.13498 5.68257 3.60793 5.17563C3.53117 4.99226 3.28458 4.25521 3.6813 3.25691C3.6813 3.25691 4.28363 3.06196 5.68508 3.99973C6.26337 3.83906 6.8834 3.75895 7.50008 3.75583C8.1166 3.75895 8.73618 3.83906 9.31553 3.99973C10.7154 3.06196 11.3166 3.25691 11.3166 3.25691C11.7146 4.25521 11.468 4.99226 11.3912 5.17563C11.865 5.68257 12.1383 6.32925 12.1383 7.12104C12.1383 9.9063 10.4396 10.5192 8.82331 10.6985C9.07763 10.9224 9.30368 11.3636 9.30368 12.0387C9.30368 13.0021 9.29508 13.7662 9.29508 14.0299C9.29508 14.2239 9.42386 14.4496 9.79349 14.3788C12.6735 13.4179 14.75 10.7025 14.75 7.50024C14.75 3.49593 11.5036 0.25 7.49933 0.25Z"
							fill="currentColor"
							fillRule="evenodd"
							clipRule="evenodd"
						/>
					</svg>
					View on GitHub
				</Button>
			</Link>
		</div>
	);
}

// ─── AddToCursor ─────────────────────────────────────────────────────────────

export function AddToCursor() {
	return (
		<div className="w-max">
			<Link
				href="cursor://anysphere.cursor-deeplink/mcp/install?name=Better%20Auth&config=eyJ1cmwiOiJodHRwczovL21jcC5pbmtlZXAuY29tL2JldHRlci1hdXRoL21jcCJ9"
				className="dark:hidden"
			>
				<img
					src="https://cursor.com/deeplink/mcp-install-dark.svg"
					alt="Add Better Auth MCP to Cursor"
					height="32"
				/>
			</Link>

			<Link
				href="cursor://anysphere.cursor-deeplink/mcp/install?name=Better%20Auth&config=eyJ1cmwiOiJodHRwczovL21jcC5pbmtlZXAuY29tL2JldHRlci1hdXRoL21jcCJ9"
				className="dark:block hidden"
			>
				<img
					src="https://cursor.com/deeplink/mcp-install-light.svg"
					alt="Add Better Auth MCP to Cursor"
					height="32"
				/>
			</Link>
		</div>
	);
}

// ─── DividerText ─────────────────────────────────────────────────────────────

export function DividerText({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center justify-center w-full">
			<div className="w-full border-b border-muted"></div>
			<div className="flex items-center justify-center w-full text-muted-foreground/80">
				{children}
			</div>
			<div className="w-full border-b border-muted"></div>
		</div>
	);
}

// ─── GenerateAppleJwt ────────────────────────────────────────────────────────

export function GenerateAppleJwt() {
	return (
		<div className="my-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground/80">
			See the Apple documentation for generating a client secret JWT.
		</div>
	);
}

// ─── Features (placeholder) ─────────────────────────────────────────────────

export function Features({ stars }: { stars?: string | null }) {
	return null;
}
