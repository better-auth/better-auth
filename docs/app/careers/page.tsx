import type { Metadata } from "next";
import { fetchGemJobPosts } from "@/lib/gem";
import { createMetadata } from "@/lib/metadata";
import { CareersPageClient } from "./careers-client";

export const metadata: Metadata = createMetadata({
	title: "Careers",
	description: "Join the Better Auth team — open positions and how to apply.",
});

export default async function CareersPage() {
	// Strip large `content` / `content_plain` fields that the careers UI never reads.
	const roles = (await fetchGemJobPosts()).map(
		({ content, content_plain, ...rest }) => rest,
	);
	return <CareersPageClient roles={roles} />;
}
