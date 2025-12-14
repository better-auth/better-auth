import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";

export function ForkButton({ url }: { url: string }) {
	return (
		<div className="flex items-center gap-2 my-2">
			<Link href={`https://codesandbox.io/p/github/${url}`} target="_blank">
				<Button className="gap-2" variant="outline" size="sm">
					<ExternalLink size={12} />
					Open in Stackblitz
				</Button>
			</Link>
			<Link href={`https://github.com/${url}`} target="_blank">
				<Button className="gap-2" variant="secondary" size="sm">
					<GitHubLogoIcon />
					View on GitHub
				</Button>
			</Link>
		</div>
	);
}
