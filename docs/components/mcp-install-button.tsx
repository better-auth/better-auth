"use client";

import { Button } from "./ui/button";

interface McpInstallButtonProps {
	name?: string;
	config?: string;
	className?: string;
}
export function McpInstallButton({
	name = "better-auth",
	config = "eyJ1cmwiOiJodHRwczovL2J0LW1jcC12ZXJjZWwudmVyY2VsLmFwcC9hcGkvbWNwIn0%3D",
	className = "",
}: McpInstallButtonProps) {
	const installUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${name}&config=${config}`;
	return (
		<Button
			className={`inline-block underline-offset-0 border border-input rounded-none ${className}`}
			onClick={() => {
				window.open(installUrl, "_blank");
			}}
		>
			Add to Cursor (MCP)
		</Button>
	);
}
