import Link from "next/link";
import { DynamicCodeBlock } from "@/components/ui/dynamic-code-block";

export const AddToCursor = () => {
	return (
		<div>
			<div className="w-max">
				<Link
					href="cursor://anysphere.cursor-deeplink/mcp/install?name=Better%20Auth&config=eyJ1cmwiOiJodHRwczovL21jcC5jaG9ua2llLmFpL2JldHRlci1hdXRoL2JldHRlci1hdXRoLWJ1aWxkZXIvbWNwIn0%3D"
					className="dark:hidden"
				>
					<img
						src="https://cursor.com/deeplink/mcp-install-dark.svg"
						alt="Add Better Auth MCP to Cursor"
						height="32"
					/>
				</Link>

				<Link
					href="cursor://anysphere.cursor-deeplink/mcp/install?name=Better%20Auth&config=eyJ1cmwiOiJodHRwczovL21jcC5jaG9ua2llLmFpL2JldHRlci1hdXRoL2JldHRlci1hdXRoLWJ1aWxkZXIvbWNwIn0%3D"
					className="dark:block hidden"
				>
					<img
						src="https://cursor.com/deeplink/mcp-install-light.svg"
						alt="Add Better Auth MCP to Cursor"
						height="32"
					/>
				</Link>
			</div>
			{/* <div>
				<DynamicCodeBlock
					lang="bash"
					code={
						"claude mcp add --transport http better-auth https://mcp.chonkie.ai/better-auth/better-auth-builder/mcp"
					}
					codeblock={{ title: "Add to Claude Code" }}
				/>
			</div> */}
		</div>
	);
};
