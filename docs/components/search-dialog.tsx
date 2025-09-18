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
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { AIChatModal, aiChatModalAtom } from "./ai-chat-modal";
import { useAtom } from "jotai";

const client = new OramaClient({
	endpoint: process.env.NEXT_PUBLIC_ORAMA_ENDPOINT!,
	api_key: process.env.NEXT_PUBLIC_ORAMA_PUBLIC_API_KEY!,
});

export function CustomSearchDialog(props: SharedProps) {
	const { locale } = useI18n();
	const [isAIModalOpen, setIsAIModalOpen] = useAtom(aiChatModalAtom);

	const { search, setSearch, query } = useDocsSearch({
		type: "orama-cloud",
		client,
		locale,
	});

	const handleAskAIClick = () => {
		props.onOpenChange?.(false);
		setIsAIModalOpen(true);
	};

	const handleAIModalClose = () => {
		setIsAIModalOpen(false);
	};

	return (
		<>
			<SearchDialog
				search={search}
				onSearchChange={setSearch}
				isLoading={query.isLoading}
				{...props}
			>
				<SearchDialogOverlay />
				<SearchDialogContent className="mt-12 md:mt-0">
					<SearchDialogHeader>
						<SearchDialogIcon />
						<SearchDialogInput />
						<Button
							variant="ghost"
							size="sm"
							onClick={handleAskAIClick}
							className="flex items-center gap-2 mr-2 text-sm hover:bg-muted"
						>
							<Bot className="h-4 w-4" />
							Ask AI
						</Button>
						<SearchDialogClose className="hidden md:block" />
					</SearchDialogHeader>
					<SearchDialogList
						items={query.data !== "empty" ? query.data : null}
					/>
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

			<AIChatModal isOpen={isAIModalOpen} onClose={handleAIModalClose} />
		</>
	);
}
