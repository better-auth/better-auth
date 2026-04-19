import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { PricingContent } from "./_components/pricing-content";

export const metadata: Metadata = createMetadata({
	title: "Pricing — Better Auth",
	description:
		"Better Auth pricing — free and open-source framework with optional managed infrastructure for dashboard, audit logs, security detection, and more.",
});

export default function PricingPage() {
	return <PricingContent />;
}
