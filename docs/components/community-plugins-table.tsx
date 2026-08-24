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
import type { CommunityPlugin } from "@/lib/community-plugins-data";
import { communityPlugins } from "@/lib/community-plugins-data";

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
			const author = row.original.author;

			return (
				<div className="w-[220px]">
					<a
						href={row.original.url}
						target="_blank"
						rel="noopener noreferrer"
						className="font-mono text-sm hover:underline text-primary"
					>
						{row.original.name}
					</a>
					<br />
					<a
						href={`https://github.com/${author?.github}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground h-12"
					>
						<img
							src={author?.avatar}
							alt={author?.name}
							className="rounded-full w-6 h-6 border opacity-70 m-0"
						/>
						<span className="text-sm">{author?.name}</span>
					</a>
				</div>
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
