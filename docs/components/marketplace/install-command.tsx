"use client";

import { DynamicCodeBlock } from "@/components/ui/dynamic-code-block";
import { cn } from "@/lib/utils";

export function InstallCommand({
	npmPackage,
	className,
}: {
	npmPackage: string;
	className?: string;
}) {
	const command = `npm i ${npmPackage}`;

	return (
		<div className={cn("min-w-0", className)}>
			<DynamicCodeBlock
				lang="bash"
				code={command}
				codeblock={{
					className: "my-0 border-t text-[12px] shadow-none [&_pre]:py-2.5",
				}}
			/>
		</div>
	);
}
