import { source, v } from "@/app/source";
import { DocsPage, DocsBody, DocsTitle } from "fumadocs-ui/page";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/utils";
import DatabaseTable from "@/components/mdx/database-tables";
import { cn } from "@/lib/utils";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { GenerateSecret } from "@/components/generate-secret";
import { AnimatePresence } from "@/components/ui/fade-in";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { Features } from "@/components/blocks/features";
import { ForkButton } from "@/components/fork-button";
import Link from "next/link";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { File, Folder, Files } from "fumadocs-ui/components/files";
import { createTypeTable } from "fumadocs-typescript/ui";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Card, Cards } from "fumadocs-ui/components/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { contents } from "@/components/sidebar-content";
import VersionRelase from "./_compoents/version-release";
import { Pre } from "fumadocs-ui/components/codeblock";
import { versions } from "@/.source";
import { versionOptions } from "@/app/layout.config";
import { createMetadata } from "@/lib/metadata";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = v.getPage(slug);
  console.log({ page });
  if (!page) {
    notFound();
  }
  const MDX = page.data.body;
  const toc = page.data.toc;

  let tocContent = toc.map((t) => {
    return {
      id: t.url,
      title: t.title.props?.children?.toString(),
    };
  });
  console.log({ tocContent });
  return (
    <VersionRelase sections={tocContent}>
      <MDX
        components={{
          ...defaultMdxComponents,
          Link: ({
            className,
            ...props
          }: React.ComponentProps<typeof Link>) => (
            <Link
              className={cn(
                "font-medium underline underline-offset-4",
                className,
              )}
              {...props}
            />
          ),
          Step,
          Steps,
          File,
          Folder,
          Files,
          Tab,
          Tabs,
          Pre: Pre,
          GenerateSecret,
          AnimatePresence,
          TypeTable,
          Features,
          ForkButton,
          DatabaseTable,
          Accordion,
          Accordions,
          iframe: (props) => <iframe {...props} className="w-full h-[500px]" />,
        }}
      />
    </VersionRelase>
  );
}

// export async function generateMetadata(props: {
//   params: Promise<{ slug?: string[] }>;
// }): Promise<Metadata> {
//   const { slug } = await props.params;

//   const page = v.getPage(slug);

//   if (!page) notFound();

//   return createMetadata({
//     title: page.data.title,
//     description:
//       page.data.title ?? "The library for building documentation sites",
//   });
// }

// export function generateStaticParams(): { slug: string }[] {
//   return v.getPages().map((page) => ({
//     slug: page.slugs[0],
//   }));
// }
