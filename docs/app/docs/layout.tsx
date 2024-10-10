import { DocsLayout } from "fumadocs-ui/layout";
import type { ReactNode } from "react";
import { docsOptions } from "../layout.config";
import ArticleLayout from "@/components/side-bar";
import { DocsNavBarMobile } from "@/components/nav-mobile";

async function getNpmVersion() {
  try {
    const response = await fetch("https://registry.npmjs.org/better-auth", {
      next: {
        revalidate: 60,
      },
    });
    if (!response?.ok) {
      return null;
    }
    const json = await response.json();
    const versions = json.versions as Record<string, string>[];
    const versionToKey = Object.keys(versions);
    const latestVersion = versionToKey[versionToKey.length - 1];
    const releases = latestVersion.split(".").slice(0, 3);
    const betaCandidate = releases[releases.length - 1];
    releases[releases.length - 1] = betaCandidate.includes("beta")
      ? betaCandidate.split("-")[0]
      : betaCandidate;

    return releases;
  } catch {
    return null;
  }
}
export default async function Layout({ children }: { children: ReactNode }) {
  const releases = await getNpmVersion();
  return (
    <DocsLayout
      {...docsOptions}
      sidebar={{
        component: <ArticleLayout releases={releases} />,
      }}
    >
      <DocsNavBarMobile />
      {children}
    </DocsLayout>
  );
}
