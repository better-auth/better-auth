import { HydrationScript } from "@solidjs/web";
import type { ParentProps } from "solid-js";

export default function Document(props: ParentProps) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<title>Better Auth Solid 2</title>
				<HydrationScript />
			</head>
			<body>{props.children}</body>
		</html>
	);
}
