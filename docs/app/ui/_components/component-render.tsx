"use client";
import { useState, useEffect } from "react";
import { ComponentShowcase } from "./component-preview";
import { Button } from "@/components/ui/button";
import { previewComponent } from "./preview-component";
import { Icons } from "@/components/icons";
import { Github } from "lucide-react";
export default function ComponentShowcaseSection({
  category,
}: {
  category: string;
}) {
  const filteredBasedOnCategory = previewComponent.filter((comp) =>
    comp.category.includes(category)
  );
  return (
    <div className="p-8 flex flex-col gap-10">
      {category === "all" ? (
        previewComponent.map((comp) => {
          return (
            <ComponentShowcase
              codeExamples={{
                react: { language: "typescript", code: comp.code.react },
                svelte: { language: "html", code: comp.code.svelte },
                astro: { language: "html", code: comp.code.astro },
                nuxt: { language: "html", code: comp.code.nuxt },
                solid: { language: "html", code: comp.code.solid },
              }}
              docLink={comp.docsLink}
              component={comp.component}
              title={comp.title}
            />
          );
        })
      ) : filteredBasedOnCategory.length === 0 ? (
        <div className="flex gap-4 flex-col justify-center items-center">
          <p className="text-center">Currently not implemeted</p>{" "}
          <a href="https://github.com/better-auth/better-auth">
            <Button className="border text-gray-600 hover:text-gray-200 dark:text-gray-200 dark:hover:bg-transparent/90 rounded-none bg-transparent flex gap-2 items-center">
              <Github className="w-4 h-4" />
              Contribute
            </Button>
          </a>
        </div>
      ) : (
        filteredBasedOnCategory.map((comp) => {
          return (
            <ComponentShowcase
              codeExamples={{
                react: { language: "typescript", code: comp.code.react },
                svelte: { language: "html", code: comp.code.svelte },
                astro: { language: "html", code: comp.code.astro },
                nuxt: { language: "html", code: comp.code.nuxt },
                solid: { language: "html", code: comp.code.solid },
              }}
              docLink={comp.docsLink}
              component={comp.component}
              title={comp.title}
            />
          );
        })
      )}{" "}
    </div>
  );
}
