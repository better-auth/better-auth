"use client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AsideLink } from "@/components/ui/aside-link";
import { FadeIn, FadeInStagger } from "@/components/ui/fade-in";
import { Suspense, useEffect, useState } from "react";
import { useSearchContext } from "fumadocs-ui/provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { contents, examples } from "./sidebar-content";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export default function ArticleLayout() {
  const { setOpenSearch } = useSearchContext();
  const pathname = usePathname();

  function getDefaultValue() {
    const defaultValue = contents.findIndex((item) =>
      item.list.some((listItem) => listItem.href === pathname)
    );
    return defaultValue === -1 ? 0 : defaultValue;
  }

  const router = useRouter();
  const searchParams = useSearchParams();
  const [group, setGroup] = useState("docs");

  useEffect(() => {
    const grp = pathname.includes("examples") ? "examples" : "docs";
    setGroup(grp);
  }, []);

  const cts = group === "docs" ? contents : examples;

  return (
    <aside className="border-r border-lines md:block hidden overflow-y-auto w-[--fd-sidebar-width] h-full sticky top-[58px] min-h-[92dvh]">
      <Select
        defaultValue="docs"
        value={group}
        onValueChange={(val) => {
          setGroup(val);
          if (val === "docs") {
            router.push("/docs");
          } else {
            router.push("/docs/examples");
          }
        }}
      >
        <SelectTrigger className="rounded-none h-16 border-none border-b border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="docs" className="h-12">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="1.3em"
                height="1.3em"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  d="M7 16h2V4H7zm-1 6q-1.25 0-2.125-.875T3 19V5q0-1.25.875-2.125T6 2h11v16H6q-.425 0-.712.288T5 19t.288.713T6 20h13V4h2v18z"
                ></path>
              </svg>
              Docs
            </div>
            <p className="text-xs">getting started, concepts, and plugins</p>
          </SelectItem>
          <SelectItem value="examples">
            <div className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                className="mx-1"
                viewBox="0 0 14 14"
              >
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M1.5 0h3.375v14H1.5A1.5 1.5 0 0 1 0 12.5v-11A1.5 1.5 0 0 1 1.5 0m4.625 7.625V14H12.5a1.5 1.5 0 0 0 1.5-1.5V7.625zM14 6.375H6.125V0H12.5A1.5 1.5 0 0 1 14 1.5z"
                  clipRule="evenodd"
                ></path>
              </svg>
              Examples
            </div>
            <p className="text-xs">examples and use cases</p>
          </SelectItem>
        </SelectContent>
      </Select>
      <div
        className="flex items-center gap-2 p-2 px-4 border-b bg-gradient-to-br dark:from-stone-900 dark:to-stone-950/80"
        onClick={() => {
          setOpenSearch(true);
        }}
      >
        <Search className="h-4 w-4" />
        <p className="text-sm bg-gradient-to-tr from-gray-500 to-stone-400 bg-clip-text text-transparent">
          Search documentation...
        </p>
      </div>

      <Accordion
        type="single"
        collapsible
        defaultValue={`item-${getDefaultValue()}`}
      >
        {cts.map((item, i) => (
          <AccordionItem value={`item-${i}`} key={item.title}>
            <AccordionTrigger className="border-b border-lines px-5 py-2.5 text-left">
              <div className="flex items-center gap-2">
                {item.Icon && <item.Icon className="w-5 h-5" />}
                {item.title}
              </div>
            </AccordionTrigger>
            <AccordionContent className=" space-y-1  p-0">
              <FadeInStagger faster>
                {item.list.map((listItem, j) => (
                  <FadeIn key={listItem.title}>
                    <Suspense fallback={<>Loading...</>}>
                      {listItem.group ? (
                        <div className="flex flex-row gap-2 items-center mx-5 my-1  ">
                          <p className="text-sm bg-gradient-to-tr dark:from-gray-100 dark:to-stone-200 bg-clip-text text-transparent from-gray-900 to-stone-900">
                            {listItem.title}
                          </p>
                          <line className="flex-grow h-px bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
                        </div>
                      ) : (
                        <AsideLink
                          href={listItem.href}
                          startWith="/docs"
                          title={listItem.title}
                          className="break-words w-[--fd-sidebar-width]"
                        >
                          <listItem.icon className="w-4 h-4 text-stone-950 dark:text-white" />
                          {listItem.title}
                        </AsideLink>
                      )}
                    </Suspense>
                  </FadeIn>
                ))}
              </FadeInStagger>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </aside>
  );
}
