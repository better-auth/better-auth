"use client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AsideLink } from "@/components/ui/aside-link";
import { FadeIn, FadeInStagger } from "@/components/ui/fade-in";
import { Suspense } from "react";
import { useSearchContext } from "fumadocs-ui/provider";
import { usePathname } from "next/navigation";
import { contents } from "./sidebar-content";
import { Search } from "lucide-react";
export default function ArticleLayout() {
  const { setOpenSearch } = useSearchContext();
  const pathname = usePathname();
  function getDefaultValue() {
    const defaultValue = contents.findIndex((item) =>
      item.list.some((listItem) => listItem.href === pathname)
    );
    return defaultValue === -1 ? 0 : defaultValue;
  }
  return (
    <aside className="border-r border-lines md:block hidden overflow-y-auto min-w-[--fd-sidebar-width] h-full sticky top-[60px] min-h-[92dvh]">
      <div
        className="flex items-center gap-2 p-2 px-4 border-b bg-gradient-to-br dark:from-stone-900 dark:to-stone-950/80"
        onClick={() => {
          setOpenSearch(true);
        }}
      >
        <Search className="h-4 w-4" />
        <p className="text-sm bg-gradient-to-tr from-gray-200 to-stone-500 bg-clip-text text-transparent">
          Search documentation...
        </p>
      </div>
      <Accordion
        type="single"
        collapsible
        defaultValue={`item-${getDefaultValue()}`}
      >
        {contents.map((item, i) => (
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
