"use client";

import { Card, CardContent } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export function Document({
	name,
	view,
	accept,
	url,
	update,
}: {
	name: string;
	view: boolean;
	accept: boolean;
	url: string;
	update: (val: {
		name: string;
		view: boolean;
		accept: boolean;
		url: string;
	}) => void;
}) {
	return (
		<Card id={name}>
			<CardContent>
				<div className="flex flex-col gap-2">
					<div className="grid grid-cols-2 gap-5">
						<div className="grid gap-2">
							<Label htmlFor={`${name}-name`}>Document Name</Label>
							<Input
								value={name}
								id={`${name}-name`}
								onChange={(e) =>
									update({ name: e.target.value, view, accept, url })
								}
							/>
						</div>
						<div className="flex gap-5 my-auto">
							<Switch
								id={`${name}-view`}
								checked={view}
								onCheckedChange={(val) =>
									update({ name, view: val, accept, url })
								}
							/>
							<div>
								<Label
									className="cursor-pointer text-left"
									htmlFor={`${name}-view`}
								>
									Must View
								</Label>
							</div>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-5">
						<div className="grid gap-2">
							<Label htmlFor={`${name}-url`}>Document URL</Label>
							<Input
								value={url}
								id={`${name}-url`}
								onChange={(e) =>
									update({ name, view, accept, url: e.target.value })
								}
							/>
						</div>
						<div className="flex gap-5 my-auto">
							<Switch
								id={`${name}-accept`}
								checked={accept}
								onCheckedChange={(val) =>
									update({ name, view, accept: val, url })
								}
							/>
							<div>
								<Label
									className="cursor-pointer text-left"
									htmlFor={`${name}-accept`}
								>
									Must Accept
								</Label>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function legalContent(name: string, read: boolean = false) {
	return `"use client"
import { useEffect } from "react"${
		read
			? `
import { authClient } from "auth-client"`
			: ""
	}
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
		
export default function Legal() {
${
	read
		? `  useEffect(() => {
    authClient.api.readLegalDocument({
      name: "${name}",
      viewedAt: new Date(),
    }).then(() => {}).catch((e) => console.error(\`${`Failed to mark legal document as read: $\{e.message}`}\`))
  })`
		: ""
}
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">${name}</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Please read the ${name}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <section className="flex flex-col gap-4">
        {*Enter the legal documents here*}
        </section>
      </CardContent>
    </Card>
  )
}`;
}
