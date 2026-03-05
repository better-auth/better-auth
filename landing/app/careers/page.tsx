import type { Metadata } from "next";
import { CareersPageClient } from "./careers-client";

export const metadata: Metadata = {
	title: "Careers",
	description: "Join the Better Auth team — open positions and how to apply.",
};

export default function CareersPage() {
	return <CareersPageClient />;
}
