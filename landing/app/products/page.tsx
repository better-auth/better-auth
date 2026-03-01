import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsPageClient } from "./products-client";

export const metadata: Metadata = {
	title: "Products",
	description:
		"Better Auth — free open-source framework with optional managed infrastructure.",
};

export default function ProductsPage() {
	return (
		<Suspense>
			<ProductsPageClient />
		</Suspense>
	);
}
