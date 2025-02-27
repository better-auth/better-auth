import { v } from "@/app/source";
import type { ReactNode } from "react";
const docOptions = {
	tree: v.pageTree,
};
export default function Layout({ children }: { children: ReactNode }) {
	return <div>{children}</div>;
}
