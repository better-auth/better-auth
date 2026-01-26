import Link from "next/link";

export const AddToCursor = () => {
	return (
		<div className="w-max">
			<Link
				href="cursor://anysphere.cursor-deeplink/mcp/install?name=Better%20Auth&config=eyJ1cmwiOiJodHRwczovL21jcC5pbmtlZXAuY29tL2JldHRlci1hdXRoL21jcCJ9"
				className="dark:hidden"
			>
				<img
					src="https://cursor.com/deeplink/mcp-install-dark.svg"
					alt="Add Better Auth MCP to Cursor"
					height="32"
				/>
			</Link>

			<Link
				href="cursor://anysphere.cursor-deeplink/mcp/install?name=Better%20Auth&config=eyJ1cmwiOiJodHRwczovL21jcC5pbmtlZXAuY29tL2JldHRlci1hdXRoL21jcCJ9"
				className="dark:block hidden"
			>
				<img
					src="https://cursor.com/deeplink/mcp-install-light.svg"
					alt="Add Better Auth MCP to Cursor"
					height="32"
				/>
			</Link>
		</div>
	);
};
