'use client';
import { ChevronsUpDown } from 'lucide-react';
import { type HTMLAttributes, type ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../../lib/utils';
import { isActive } from '../../../lib/is-active';
import { useSidebar } from 'fumadocs-ui/provider';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export interface Option {
  /**
   * Redirect URL of the folder, usually the index page
   */
  url: string;

  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;

  /**
   * Detect from a list of urls
   */
  urls?: Set<string>;

  props?: HTMLAttributes<HTMLElement>;
}

export function RootToggle({
  options,
  placeholder,
  ...props
}: {
  placeholder?: ReactNode;
  options: Option[];
} & HTMLAttributes<HTMLButtonElement>) {
  const [open, setOpen] = useState(false);
  const { closeOnRedirect } = useSidebar();
  const pathname = usePathname();

  const selected = useMemo(() => {
    return options.findLast((item) =>
      item.urls
        ? item.urls.has(
            pathname.endsWith('/') ? pathname.slice(0, -1) : pathname,
          )
        : isActive(item.url, pathname, true),
    );
  }, [options, pathname]);

  const onClick = () => {
    closeOnRedirect.current = false;
    setOpen(false);
  };

  const item = selected ? <Item {...selected} /> : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {item ? (
        <PopoverTrigger
          {...props}
          className={cn(
            'flex flex-row items-center gap-2.5 rounded-lg ps-2 pe-4 py-1.5 hover:bg-fd-accent/50 hover:text-fd-accent-foreground',
            props.className,
          )}
        >
          {item}
          <ChevronsUpDown className="size-4 text-fd-muted-foreground" />
        </PopoverTrigger>
      ) : null}
      <PopoverContent className="w-(--radix-popover-trigger-width) overflow-hidden p-0">
        {options.map((item) => (
          <Link
            key={item.url}
            href={item.url}
            onClick={onClick}
            {...item.props}
            className={cn(
              'flex w-full flex-row items-center gap-2 px-2 py-1.5',
              selected === item
                ? 'bg-fd-accent text-fd-accent-foreground'
                : 'hover:bg-fd-accent/50',
              item.props?.className,
            )}
          >
            <Item {...item} />
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Item(props: Option) {
  return (
    <>
      {props.icon}
      <div className="flex-1 text-start">
        <p className="text-sm font-medium">{props.title}</p>
        {props.description ? (
          <p className="text-xs text-fd-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
    </>
  );
}
