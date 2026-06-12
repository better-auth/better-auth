import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { BrandClient } from "./brand-client";

export const metadata: Metadata = createMetadata({
	title: "Brand",
	description:
		"The Better Auth design system — tokens, components, and motifs used across our product and docs.",
});

export default function BrandPage() {
	return <BrandClient />;
}
