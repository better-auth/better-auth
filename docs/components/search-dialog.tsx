"use client";

import type { SharedProps } from "fumadocs-ui/components/dialog/search";
import dynamic from "next/dynamic";

const InkeepCustomTrigger = dynamic(
	() => import("@inkeep/widgets").then((mod) => mod.InkeepCustomTrigger),
	{
		ssr: false,
	},
);

const baseSettings = {
	apiKey: process.env.NEXT_PUBLIC_INKEEP_API_KEY!,
	integrationId: process.env.NEXT_PUBLIC_INKEEP_INTEGRATION_ID!,
	organizationId: process.env.NEXT_PUBLIC_INKEEP_ORGANIZATION_ID!,
	primaryBrandColor: "#000000",
};

export function CustomSearchDialog(props: SharedProps) {
	return (
		<InkeepCustomTrigger
			baseSettings={baseSettings}
			isOpen={props.open}
			onClose={() => {
				props.onOpenChange(false);
			}}
		/>
	);
}
