"use client";

import {
	SearchDialog,
	SearchDialogClose,
	SearchDialogContent,
	SearchDialogFooter,
	SearchDialogHeader,
	SearchDialogIcon,
	SearchDialogInput,
	SearchDialogList,
	SearchDialogOverlay,
	type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { useDocsSearch } from "fumadocs-core/search/client";
import { OramaClient } from "@oramacloud/client";
import { useI18n } from "fumadocs-ui/contexts/i18n";

const client = new OramaClient({
	endpoint: process.env.NEXT_PUBLIC_ORAMA_ENDPOINT!,
	api_key: process.env.NEXT_PUBLIC_ORAMA_PUBLIC_API_KEY!,
});

export function CustomSearchDialog(props: SharedProps) {
	const { locale } = useI18n();
	const { search, setSearch, query } = useDocsSearch({
		type: "orama-cloud",
		client,
		locale,
	});

	return (
		<SearchDialog
			search={search}
			onSearchChange={setSearch}
			isLoading={query.isLoading}
			{...props}
		>
			<SearchDialogOverlay />
			<SearchDialogContent>
				<SearchDialogHeader>
					<SearchDialogIcon />
					<SearchDialogInput />
					<SearchDialogClose />
				</SearchDialogHeader>
				<SearchDialogList items={query.data !== "empty" ? query.data : null} />
				<SearchDialogFooter>
					<a
						href="https://orama.com"
						rel="noreferrer noopener"
						className="ms-auto text-xs text-fd-muted-foreground"
					>
						Search powered by Orama
					</a>
				</SearchDialogFooter>
			</SearchDialogContent>
		</SearchDialog>
	);
}
