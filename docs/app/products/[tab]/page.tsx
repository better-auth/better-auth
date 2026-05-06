import { redirect } from "next/navigation";

export function generateStaticParams() {
	return [{ tab: "framework" }, { tab: "infrastructure" }];
}

export default function TabPage() {
	redirect("/pricing");
}
