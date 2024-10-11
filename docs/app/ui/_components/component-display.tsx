"use client";
import { useState, useEffect } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import TabsTrigger from "@/components/tabs";
import { Separator } from "@/components/ui/separator";
import ComponentShowcaseSection from "./component-render";

const tabs = [
  {
    name: "All",
    value: "all",
  },
  {
    name: "Credential",
    value: "credential",
  },
  {
    name: "Social Providers",
    value: "social",
  },
  {
    name: "Organization",
    value: "org",
  },
  {
    name: "Plugins",
    value: "plugin",
  },
  {
    name: "Others",
    value: "others",
  },
];
export const ComponentDisplay = () => {
  const [selectedTab, setSelectedTab] = useState("all");
  return (
    <div>
      <Tabs.Root
        className="mt-[-20rem] flex-1 overflow-hidden bg-transparent  w-full pb-10"
        defaultValue={selectedTab}
        onValueChange={(value) => setSelectedTab(value)}
      >
        <Tabs.List
          className="flex items-center justify-center px-4 py-2 mb-2   overflow-auto gap-4 "
          aria-label="Switch between supported frameworks"
        >
          {tabs.map((item, idx) => (
            <TabsTrigger key={idx} value={item.value} selectedTab={selectedTab}>
              <div className="flex items-center gap-x-2 relative z-10 font-mono uppercase tracking-tight">
                {item.name}
              </div>
            </TabsTrigger>
          ))}
        </Tabs.List>
        <Separator className="mx-auto max-w-2xl mb-10 h-[2px] bg-white/5" />
        <ComponentShowcaseSection category={selectedTab} />
      </Tabs.Root>
    </div>
  );
};
