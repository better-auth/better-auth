import type { Metadata } from "next";
import { EnterprisePageClient } from "./enterprise-client";

export const metadata: Metadata = {
	title: "Enterprise",
	description:
		"Better Auth for enterprise — SSO, SAML, audit logs, and dedicated support.",
};

export default function EnterprisePage() {
	return <EnterprisePageClient />;
}
