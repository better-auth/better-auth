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
import type { CommunityAdapter } from "@/lib/community-adapters-data";
import { communityAdapters } from "@/lib/community-adapters-data";

const columns: ColumnDef<CommunityAdapter>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => {
			return (
				<button
					type="button"
					className="flex items-center gap-2 font-semibold hover:text-foreground transition-colors whitespace-nowrap"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Adapter
					<ArrowUpDown className="h-4 w-4" />
				</button>
			);
		},
		cell: ({ row }) => {
			return (
				<div className="w-[260px]">
					<a
						href={row.original.url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
					>
						<code className="text-sm font-mono tracking-tight whitespace-nowrap">
							{row.original.name}
						</code>
					</a>
				</div>
			);
		},
	},
	{
		accessorKey: "database",
		header: ({ column }) => {
			return (
				<button
					type="button"
					className="flex items-center gap-2 font-semibold hover:text-foreground transition-colors whitespace-nowrap"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Database
					<ArrowUpDown className="h-4 w-4" />
				</button>
			);
		},
		cell: ({ row }) => {
			return (
				<a
					href={row.original.databaseUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
				>
					{row.original.database}
				</a>
			);
		},
	},
	{
		accessorFn: (adapter) => adapter.author.name,
		id: "author",
		header: ({ column }) => {
			return (
				<button
					type="button"
					className="flex items-center gap-2 font-semibold hover:text-foreground transition-colors whitespace-nowrap"
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
					href={author.url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground whitespace-nowrap"
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

export function CommunityAdaptersTable() {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");

	const table = useReactTable({
		data: communityAdapters,
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
		<div className="not-prose w-full space-y-4">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<p>
					Showing {table.getRowModel().rows.length} of{" "}
					{communityAdapters.length} adapters
				</p>
			</div>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					aria-label="Search community adapters"
					placeholder="Search adapters, databases, or authors..."
					value={globalFilter ?? ""}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="w-full rounded-lg border bg-background pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>
			<div className="rounded-lg border">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[720px]">
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
										className="border-b last:border-b-0 transition-colors hover:bg-muted/50"
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
										No adapters found.
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
