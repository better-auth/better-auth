"use client";

import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { Button } from "./ui/button";

interface McpInstallButtonProps {
	name?: string;
	config?: string;
	className?: string;
}

export function McpInstallButton({
	name = "better-auth",
	config = "eyJ1cmwiOiJodHRwczovL2h0dHBzOi8vYnQtbWNwLXZlcmNlbC52ZXJjZWwuYXBwL2FwaS9tY3AifQ%3D%3D",
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
