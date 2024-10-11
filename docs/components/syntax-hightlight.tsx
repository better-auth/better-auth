"use client";

import Prism from "prismjs";
import "prismjs/components/prism-jsx";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
export default ({
  code,
  fm,
  className = "",
}: {
  fm?: string;
  code: string;
  className?: string;
}) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [code, fm]);

  return (
    <pre>
      <code className={cn(`language-${fm} text-sm w-full ${className}`)}>
        {code}
      </code>
    </pre>
  );
};
