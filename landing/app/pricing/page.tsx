import type { Metadata } from "next";
import { PricingPageClient } from "./pricing-client";

export const metadata: Metadata = {
	title: "Pricing",
	description:
		"Better Auth pricing — free open-source with optional enterprise plans.",
};

export default function PricingPage() {
	return <PricingPageClient />;
}
