import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FrameworkContent } from "./_components/framework-content";
import { InfrastructureContent } from "./_components/infrastructure-content";
import { createMetadata } from "@/lib/metadata";

const tabs = {
	framework: {
		title: "Framework — Products",
		description:
			"Better Auth — a comprehensive, framework-agnostic authentication library for TypeScript. Free and open source under the MIT license.",
	},
	infrastructure: {
		title: "Infrastructure — Products",
		description:
			"Better Auth Infrastructure — dashboard, audit logs, security detection, and more for your auth.",
	},
} as const;

type Tab = keyof typeof tabs;

export function generateStaticParams() {
	return Object.keys(tabs).map((tab) => ({ tab }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ tab: string }>;
}): Promise<Metadata> {
	const { tab } = await params;
	const meta = tabs[tab as Tab];
	if (!meta) return {};
	return createMetadata({ title: meta.title, description: meta.description });
}

export default async function TabPage({
	params,
}: {
	params: Promise<{ tab: string }>;
}) {
	const { tab } = await params;

	if (tab === "framework") return <FrameworkContent />;
	if (tab === "infrastructure") return <InfrastructureContent />;

	redirect("/products/framework");
}
