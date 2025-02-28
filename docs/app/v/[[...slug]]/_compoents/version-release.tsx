"use client";
import { useState } from "react";
import TableOfContents from "./toc";
import { cn, formatDate } from "@/lib/utils";

export default function VersionRelase({
  children,
  sections,
  title,
  description,
  date,
}: {
  children: React.ReactElement;
  sections: {
    title: string;
    id: string;
  }[];
  title: string;
  description: string;
  date: Date;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("# Use the automated upgrade CLI");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col relative min-h-screen space-y-10 bg-black/90 text-white">
      {/* Header Section */}
      <div className="flex">
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl sticky top-0 space-y-5 mt-20 mx-auto py-8 px-4">
            <div className="size-full absolute top-0 left-0 bg-[length:65px_65px] opacity-5 bg-[url(/plus.svg)] bg-repeat w-full h-full" />

            <h1 className="text-5xl mb-4 text-center">
              {title} - {formatDate(date)}
            </h1>
            <p className="text-lg text-gray-400 text-center max-w-xl mx-auto">
              {description}
            </p>
          </div>
        </div>
      </div>

      {/* Grid Background */}
      <div className="relative py-24 pb-0">
        <div className="absolute inset-0 z-0">
          <div className="grid grid-cols-12 h-full">
            {Array(12)
              .fill(null)
              .map((_, i) => (
                <div
                  key={i}
                  className="border-l border-dashed border-stone-100 dark:border-white/10 h-full"
                />
              ))}
          </div>
          <div className="grid grid-rows-12 w-full absolute top-0">
            {Array(12)
              .fill(null)
              .map((_, i) => (
                <div
                  key={i}
                  className="border-t border-dashed border-stone-100 dark:border-stone-900/60 w-full"
                />
              ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-black max-w-6xl mx-auto text-white/90 flex-grow">
        <div className="container mx-auto px-4 py-8 flex gap-8">
          <TableOfContents sections={sections} />

          <main className="flex-1 space-y-8 relative pb-44 border px-10 border-dashed border-zinc-400  dark:border-zinc-700/50 relative">
            <Icon className="-top-3 -left-3" />
            <Icon className="-top-3 -right-3" />
            <Icon className="-bottom-3 -left-3" />
            <Icon className="-bottom-3 -right-3" />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
const Icon = ({ className, ...rest }: any) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width={24}
      height={30}
      strokeWidth="1"
      stroke="currentColor"
      {...rest}
      className={cn(
        "dark:text-white/50 text-black/50 size-6 absolute",
        className,
      )}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
    </svg>
  );
};
