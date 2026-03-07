import type { Metadata } from "next";
import { EnterprisePageClient } from "./enterprise-client";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
	title: "Enterprise",
	description:
		"Better Auth for enterprise — SSO, SAML, audit logs, and dedicated support.",
});

export default function EnterprisePage() {
	return <EnterprisePageClient />;
}
