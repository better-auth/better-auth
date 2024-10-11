import { ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import LazyMotionWrapper from "./lazy-wrapper";
import { cn } from "@/lib/utils";
export default ({
  children,
  className,
  value,
  selectedTab,
}: {
  children: ReactNode;
  value: any;
  className?: string;
  selectedTab: any;
}) => (
  <Tabs.Trigger
    className={cn(
      "relative py-2 px-3 rounded-none text-sm text-zinc-400 hover:text-zinc-100 data-[state=active]:text-zinc-100",
      className
    )}
    value={value}
  >
    {children}
    {selectedTab == value ? (
      <LazyMotionWrapper>
        <motion.span
          className="absolute inset-0 rounded-none border border-zinc-700 bg-gradient-to-tr from-stone-950 via-stone-900 to-stone-900"
          layoutId="bubble"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        ></motion.span>
      </LazyMotionWrapper>
    ) : (
      ""
    )}
  </Tabs.Trigger>
);
