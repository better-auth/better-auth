"use client";

import type {
	ColumnDef,
	ColumnFiltersState,
	SortingState,
} from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Search } from "lucide-react";
import { useState } from "react";

export interface CommunityPlugin {
	name: string;
	url: string;
	description: string;
	author: {
		name: string;
		github: string;
		avatar: string;
	};
}

const columns: ColumnDef<CommunityPlugin>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => {
			return (
				<button
					className="flex items-center gap-2 font-semibold hover:text-foreground transition-colors"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Plugin
					<ArrowUpDown className="h-4 w-4" />
				</button>
			);
		},
		cell: ({ row }) => {
			return (
				<a
					href={row.original.url}
					target="_blank"
					rel="noopener noreferrer"
					className="font-mono text-sm hover:underline text-primary"
				>
					{row.original.name}
				</a>
			);
		},
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => {
			return (
				<div className="text-sm text-muted-foreground">
					{row.original.description}
				</div>
			);
		},
	},
	{
		accessorKey: "author.name",
		header: ({ column }) => {
			return (
				<button
					className="flex items-center gap-2 font-semibold hover:text-foreground transition-colors"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Author
					<ArrowUpDown className="h-4 w-4" />
				</button>
			);
		},
		cell: ({ row }) => {
			const author = row.original.author;
			return (
				<a
					href={`https://github.com/${author.github}`}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2 hover:text-foreground transition-colors"
				>
					<img
						src={author.avatar}
						alt={author.name}
						className="rounded-full w-6 h-6 border opacity-70 m-0"
					/>
					<span className="text-sm">{author.name}</span>
				</a>
			);
		},
	},
];

export const communityPlugins: CommunityPlugin[] = [
	{
		name: "@dymo-api/better-auth",
		url: "https://github.com/TPEOficial/dymo-api-better-auth",
		description:
			"Sign Up Protection and validation of disposable emails (the world's largest database with nearly 14 million entries).",
		author: {
			name: "TPEOficial",
			github: "TPEOficial",
			avatar: "https://github.com/TPEOficial.png",
		},
	},
	{
		name: "better-auth-harmony",
		url: "https://github.com/gekorm/better-auth-harmony/",
		description:
			"Email & phone normalization and additional validation, blocking over 55,000 temporary email domains.",
		author: {
			name: "GeKorm",
			github: "GeKorm",
			avatar: "https://github.com/GeKorm.png",
		},
	},
	{
		name: "validation-better-auth",
		url: "https://github.com/Daanish2003/validation-better-auth",
		description:
			"Validate API request using any validation library (e.g., Zod, Yup)",
		author: {
			name: "Daanish2003",
			github: "Daanish2003",
			avatar: "https://github.com/Daanish2003.png",
		},
	},
	{
		name: "better-auth-localization",
		url: "https://github.com/marcellosso/better-auth-localization",
		description:
			"Localize and customize better-auth messages with easy translation and message override support.",
		author: {
			name: "marcellosso",
			github: "marcellosso",
			avatar: "https://github.com/marcellosso.png",
		},
	},
	{
		name: "better-auth-attio-plugin",
		url: "https://github.com/tobimori/better-auth-attio-plugin",
		description: "Sync your products Better Auth users & workspaces with Attio",
		author: {
			name: "tobimori",
			github: "tobimori",
			avatar: "https://github.com/tobimori.png",
		},
	},
	{
		name: "better-auth-cloudflare",
		url: "https://github.com/zpg6/better-auth-cloudflare",
		description:
			"Seamlessly integrate with Cloudflare Workers, D1, Hyperdrive, KV, R2, and geolocation services. Includes CLI for project generation, automated resource provisioning on Cloudflare, and database migrations. Supports Next.js, Hono, and more!",
		author: {
			name: "zpg6",
			github: "zpg6",
			avatar: "https://github.com/zpg6.png",
		},
	},
	{
		name: "expo-better-auth-passkey",
		url: "https://github.com/kevcube/expo-better-auth-passkey",
		description:
			"Better-auth client plugin for using passkeys on mobile platforms in expo apps. Supports iOS, macOS, Android (and web!) by wrapping the existing better-auth passkey client plugin.",
		author: {
			name: "kevcube",
			github: "kevcube",
			avatar: "https://github.com/kevcube.png",
		},
	},
	{
		name: "better-auth-credentials-plugin",
		url: "https://github.com/erickweil/better-auth-credentials-plugin",
		description: "LDAP authentication plugin for Better Auth.",
		author: {
			name: "erickweil",
			github: "erickweil",
			avatar: "https://github.com/erickweil.png",
		},
	},
	{
		name: "better-auth-opaque",
		url: "https://github.com/TheUntraceable/better-auth-opaque",
		description:
			"Provides database-breach resistant authentication using the zero-knowledge OPAQUE protocol.",
		author: {
			name: "TheUntraceable",
			github: "TheUntraceable",
			avatar: "https://github.com/theuntraceable.png",
		},
	},
	{
		name: "better-auth-firebase-auth",
		url: "https://github.com/yultyyev/better-auth-firebase-auth",
		description:
			"Firebase Authentication plugin for Better Auth with built-in email service, Google Sign-In, and password reset functionality.",
		author: {
			name: "yultyyev",
			github: "yultyyev",
			avatar: "https://github.com/yultyyev.png",
		},
	},
	{
		name: "better-auth-university",
		url: "https://github.com/LuyxLLC/better-auth-university",
		description:
			"University plugin for allowing only specific email domains to be passed through. Includes a University model with name and domain.",
		author: {
			name: "Fyrlex",
			github: "Fyrlex",
			avatar: "https://github.com/Fyrlex.png",
		},
	},
	{
		name: "@alexasomba/better-auth-paystack",
		url: "https://github.com/alexasomba/better-auth-paystack",
		description:
			"Paystack plugin for Better Auth — integrates Paystack transactions, webhooks, and subscription flows.",
		author: {
			name: "alexasomba",
			github: "alexasomba",
			avatar: "https://github.com/alexasomba.png",
		},
	},
	{
		name: "better-auth-lark",
		url: "https://github.com/uselark/better-auth-lark",
		description:
			"Lark billing plugin that automatically creates customers and subscribes them to free plans on signup.",
		author: {
			name: "Vijit",
			github: "vijit-lark",
			avatar: "https://github.com/vijit-lark.png",
		},
	},
	{
		name: "stargate-better-auth",
		url: "https://github.com/neiii/stargate-better-auth",
		description:
			"Gate access to resources based on whether the user has starred a repository",
		author: {
			name: "neiii",
			github: "neiii",
			avatar: "https://github.com/neiii.png",
		},
	},
	{
		name: "@sequenzy/better-auth",
		url: "https://github.com/Sequenzy/sequenzy-better-auth",
		description:
			"Automatically add users to Sequenzy mailing lists on signup for seamless email marketing integration.",
		author: {
			name: "Sequenzy",
			github: "sequenzy",
			avatar: "https://sequenzy.com/logo.png",
		},
	},
];
export function CommunityPluginsTable() {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");

	const table = useReactTable({
		data: communityPlugins,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalFilter,
		state: {
			sorting,
			columnFilters,
			globalFilter,
		},
	});

	return (
		<div className="w-full">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<p>
					Showing {table.getRowModel().rows.length} of {communityPlugins.length}{" "}
					plugins
				</p>
			</div>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search plugins, descriptions, or authors..."
					value={globalFilter ?? ""}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="w-full rounded-lg border bg-background pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>
			<div className="rounded-lg">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							{table.getHeaderGroups().map((headerGroup) => (
								<tr key={headerGroup.id} className="border-b bg-muted/50">
									{headerGroup.headers.map((header) => (
										<th
											key={header.id}
											className="px-4 py-3 text-left text-sm font-medium"
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</th>
									))}
								</tr>
							))}
						</thead>
						<tbody>
							{table.getRowModel().rows?.length ? (
								table.getRowModel().rows.map((row) => (
									<tr
										key={row.id}
										className="border-b transition-colors hover:bg-muted/50"
									>
										{row.getVisibleCells().map((cell) => (
											<td key={cell.id} className="px-4 py-3">
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</td>
										))}
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={columns.length}
										className="px-4 py-8 text-center text-muted-foreground"
									>
										No plugins found.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
