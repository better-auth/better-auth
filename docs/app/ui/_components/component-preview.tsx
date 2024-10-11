"use client";

import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Layout, Loader2, Link2 } from "lucide-react";
import { Icons } from "@/components/icons";
import Link from "next/link";
import SyntaxHightlight from "@/components/syntax-hightlight";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
interface CodeExample {
  language: string;
  code: string;
}

interface ComponentShowcaseProps {
  component: React.ReactNode;
  docLink?: string;
  codeExamples: {
    react: CodeExample;
    svelte: CodeExample;
    astro: CodeExample;
    solid: CodeExample;
    nuxt: CodeExample;
  };
  title: string;
}

export function ComponentShowcase({
  component,
  codeExamples,
  title,
  docLink,
}: ComponentShowcaseProps) {
  const [copiedStates, setCopiedStates] = useState({
    react: false,
    svelte: false,
    astro: false,
    nuxt: false,
    solid: false,
  });
  const [fm, setFm] = useState("react");
  const [loading, setLoading] = useState(false);

  const copyToClipboard = (
    text: string,
    framework: keyof typeof copiedStates
  ) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedStates((prev) => ({ ...prev, [framework]: true }));
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [framework]: false }));
      }, 2000);
    });
  };

  return (
    <Card className="w-full bg-transparent max-w-7xl mx-auto rounded-none">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold mb-4">{title}</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${docLink}`}>
                  <Link2 className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reference Docs</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Tabs defaultValue="preview" className="w-full ">
          <TabsList className="md:ml-[-5px] flex data-[state=active]:bg-background items-center bg-tranparent gap-3 w-fit  rounded-none">
            <TabsTrigger
              className="rounded-none data-[state=active]:text-white flex items-center gap-2 data-[state=active]:bg-stone-900 "
              value="preview"
              onClick={() => setFm("preview")}
            >
              <Layout className="w-4 h-4" />
              Preview
            </TabsTrigger>
            <div className="mx-5">
              <div className="w-[1px] h-[30px] z-20 bg-black/50 dark:bg-white/20"></div>
            </div>
            <TabsTrigger
              className="flex py-2 data-[state=active]:text-white rounded-none gap-2 items-center data-[state=active]:bg-stone-900"
              value="react"
              onClick={() => setFm("jsx")}
            >
              <Icons.nextJS className="w-4 h-4" />
              React
            </TabsTrigger>
            <TabsTrigger
              className="flex py-2 data-[state=active]:text-white rounded-none gap-2 items-center  data-[state=active]:bg-stone-900"
              value="svelte"
              onClick={() => setFm("js")}
            >
              <Icons.svelteKit />
              Svelte
            </TabsTrigger>
            <TabsTrigger
              className="flex py-2 data-[state=active]:text-white rounded-none gap-2 items-center data-[state=active]:bg-stone-900 "
              value="astro"
              onClick={() => setFm("js")}
            >
              <Icons.astro />
              Astro
            </TabsTrigger>
            <TabsTrigger
              className="flex py-2 data-[state=active]:text-white rounded-none gap-2 items-center data-[state=active]:bg-stone-900"
              value="solid"
              onClick={() => setFm("jsx")}
            >
              <Icons.solidStart />
              Solid{" "}
            </TabsTrigger>
            <TabsTrigger
              className="flex  py-2 data-[state=active]:text-white rounded-none gap-2 items-center data-[state=active]:bg-stone-900"
              value="nuxt"
              onClick={() => setFm("html")}
            >
              <Icons.nuxt />
              Nuxt
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="preview"
            className=" md:mt-[-2px] p-4 border rounded-none"
          >
            <main className="overflow-hidden bg-gray-50 dark:bg-gradient-to-tr dark:from-stone-950 dark:via-stone-900 dark:to-stone-950">
              <div className="isolate flex min-h-dvh items-center justify-center p-6 lg:p-8">
                {component}
              </div>
            </main>
          </TabsContent>
          {Object.entries(codeExamples).map(([framework, example]) => (
            <TabsContent
              className="border h-[600px] md:mt-[-2px] overflow-auto data-[state=active]:bg-transparent bg-transparent rounded-none"
              key={framework}
              value={framework}
            >
              <div className="relative">
                <SyntaxHightlight fm={fm} code={example.code} key={framework} />
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute top-2 right-4"
                  onClick={() =>
                    copyToClipboard(
                      example.code,
                      framework as keyof typeof copiedStates
                    )
                  }
                >
                  {copiedStates[framework as keyof typeof copiedStates] ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="sr-only">Copy code</span>
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
