import type { Metadata } from "next";
import { fetchGemJobPosts } from "@/lib/gem";
import { createMetadata } from "@/lib/metadata";
import { CareersPageClient } from "./careers-client";

export const metadata: Metadata = createMetadata({
	title: "Careers",
	description: "Join the Better Auth team — open positions and how to apply.",
});

export default async function CareersPage() {
	const roles = await fetchGemJobPosts();
	return <CareersPageClient roles={roles} />;
}
