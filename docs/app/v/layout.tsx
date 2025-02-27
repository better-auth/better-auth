import { v } from "@/app/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { docsOptions } from "../layout.config";
const docOptions = {
  tree: v.pageTree,
};
export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
