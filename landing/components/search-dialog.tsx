"use client";

import type {
	SearchItemType,
	SharedProps,
} from "fumadocs-ui/components/dialog/search";
import {
	SearchDialog,
	SearchDialogClose,
	SearchDialogContent,
	SearchDialogFooter,
	SearchDialogHeader,
	SearchDialogInput,
	SearchDialogList,
	SearchDialogListItem,
	SearchDialogOverlay,
	useSearch,
} from "fumadocs-ui/components/dialog/search";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Client } from "typesense";
import { useTypesenseSearch } from "typesense-fumadocs-adapter/client";
import { usePages } from "@/app/docs/provider";

const typesenseClient = (() => {
	const url = process.env.NEXT_PUBLIC_TYPESENSE_SERVER_URL;
	const apiKey = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY;
	if (!url || !apiKey) {
		// Return a dummy client so the app works without Typesense configured
		return new Client({
			nodes: [{ host: "localhost", port: 8108, protocol: "http" }],
			apiKey: "dummy",
		});
	}
	const serverUrl = new URL(url);
	return new Client({
		nodes: [
			{
				host: serverUrl.hostname,
				port:
					Number(serverUrl.port) ||
					(serverUrl.protocol === "https:" ? 443 : 80),
				protocol: serverUrl.protocol.replace(":", ""),
			},
		],
		apiKey,
	});
})();

export default function CustomSearchDialog(props: SharedProps) {
	const { search, setSearch, query } = useTypesenseSearch({
		typesenseCollectionName: "better-auth-docs",
		client: typesenseClient!,
	});
	const pages = usePages();
	const router = useRouter();

	const pageTreeAction = useMemo<SearchItemType | undefined>(() => {
		if (search.length === 0) return;

		const normalized = search.toLowerCase();
		for (const page of pages) {
			if (!page.name.toLowerCase().includes(normalized)) continue;

			return {
				id: "quick-action",
				type: "action",
				node: (
					<div className="inline-flex items-center gap-2 text-fd-muted-foreground">
						<ArrowRight className="size-4" />
						<p>
							Jump to{" "}
							<span className="font-medium text-fd-foreground">
								{page.name}
							</span>
						</p>
					</div>
				),
				onSelect: () => router.push(page.url),
			};
		}
	}, [router, search, pages]);

	return (
		<SearchDialog
			search={search}
			onSearchChange={setSearch}
			isLoading={query.isLoading}
			{...props}
		>
			<SearchDialogOverlay className="z-200" />
			<SearchDialogContent className="z-200">
				<SearchDialogHeader>
					<LoadingSearchIcon />
					<SearchDialogInput />
					<SearchDialogClose />
				</SearchDialogHeader>
				<SearchDialogList
					items={
						query.data !== "empty" || pageTreeAction
							? [
									...(pageTreeAction ? [pageTreeAction] : []),
									...(Array.isArray(query.data) ? query.data : []),
								]
							: null
					}
					Item={({ item, onClick }) => (
						<SearchDialogListItem
							item={item}
							onClick={onClick}
							className={
								item.type !== "action"
									? "max-h-24 [&>div:last-child]:line-clamp-2"
									: undefined
							}
						/>
					)}
				/>
				<SearchDialogFooter>
					<span className="text-xs text-fd-muted-foreground">
						Search powered by{" "}
						<a
							href="https://typesense.org"
							target="_blank"
							rel="noreferrer noopener"
							className="underline hover:text-fd-foreground transition-colors"
						>
							Typesense
						</a>
					</span>
				</SearchDialogFooter>
			</SearchDialogContent>
		</SearchDialog>
	);
}

function LoadingSearchIcon() {
	const { isLoading } = useSearch();

	return (
		<Search
			className={
				isLoading
					? "size-5 animate-pulse text-foreground duration-200"
					: "size-5 text-fd-muted-foreground"
			}
		/>
	);
}
