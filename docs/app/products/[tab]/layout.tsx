import { ProductsShell } from "./_components/products-shell";

export default async function TabLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ tab: string }>;
}) {
	const { tab } = await params;

	return <ProductsShell tab={tab}>{children}</ProductsShell>;
}
