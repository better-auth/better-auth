import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

type Props = {
	href: string;
	children: React.ReactNode;
};

export function BackLink({ href, children }: Props) {
	return (
		<div>
			<Link
				href={href}
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ArrowLeftIcon className="size-4" />
				{children}
			</Link>
		</div>
	);
}
