import type { Metadata } from "next";
import { CompanyPageClient } from "./company-client";

export const metadata: Metadata = {
	title: "Company",
	description: "About Better Auth — our mission, team, and values.",
};

export default function CompanyPage() {
	return <CompanyPageClient />;
}
