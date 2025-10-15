import { Label } from "@/ui/label";
import { useOptions } from "../context";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from "../ui/card";
import { Input } from "@/ui/input";
import type { Node, SignInMethod } from "../../../core/src/plugins";
import { Separator } from "@/ui/separator";
import React, { useTransition } from "react";

export default function SignIn() {
	const options = useOptions();
	const config = options.pluginConfig?.components?.signIn;
	const methods = config?.methods;
	const [loading, startTransition] = useTransition();

	if (!methods) throw new Error("No methods found");

	const groups = methods.reduce(
		(red, val, i) => {
			return val.group in red
				? { ...red, [val.group]: [...red[val.group]!, val] }
				: { ...red, [val.group]: [val] };
		},
		{} as Record<string, SignInMethod[]>,
	);

	return (
		<Card
			className={config.styles.root.className}
			style={config.styles.root.styles}
		>
			<CardHeader>
				<CardTitle
					className={config.title.className}
					style={config.title.styles}
				>
					{config.title.text}
				</CardTitle>
				<CardDescription
					className={config.description.className}
					style={config.description.styles}
				>
					{config.description.text}
				</CardDescription>
			</CardHeader>
			<CardContent
				className={config.styles.main.className}
				style={config.styles.main.styles}
			>
				{Object.entries(groups).map(([name, methods], i, arr) => {
					return (
						<>
							<div key={i} id={name}>
								{methods.map((m) => {
									return <div></div>;
								})}
							</div>
							{i !== arr.length - 1 ? <Separator /> : <></>}
						</>
					);
				})}
			</CardContent>
			<CardFooter
				className={config.footer.className}
				style={config.footer.styles}
			>
				<div>
					<ul>
						{config.footer.elms
							.filter(({ bulletPoint }) => bulletPoint)
							.map(({ node }) => (
								<>
									<li>{node}</li>
								</>
							))}
					</ul>
				</div>
				<div>
					{config.footer.elms
						.filter(({ bulletPoint }) => !bulletPoint)
						.map(({ node }) => (
							<>
								<div>{node}</div>
								<br />
							</>
						))}
				</div>
			</CardFooter>
		</Card>
	);
}
