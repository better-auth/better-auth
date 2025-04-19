import { ArrowUpRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResourceCardProps {
  title: string;
  description: string;
  href: string;
  tags?: string[];
  className?: string;
}

export function ResourceCard({
  title,
  description,
  href,
  tags,
  className,
}: ResourceCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative flex rounded-none flex-col group space-y-1 border transition-colors hover:bg-muted/80",
        className
      )}
    >

    <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 group-hover:opacity-100 opacity-80 text-muted-foreground transition-colors group-hover:text-foreground no-underline underline-offset-0" />
      <div className="p-4 py-0 flex items-start justify-between">
        <h3 className="font-semibold tracking-tight no-underline">{title}</h3>
      </div>
      <p dangerouslySetInnerHTML={{__html:  `${description}` }} className="p-4 text-sm md:decoration-none text-muted-foreground"></p>
      {tags && tags.length > 0 && (
        <div className="py-3 border-zinc-700/80 border-t-[1.2px] flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md bg-secondary/10 px-2 py-1 text-xs font-medium text-secondary-foreground no-underline"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
} 