"use client";

import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { client } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ConsentBtns() {
	const [loading, setLoading] = useState(false);
	return (
		<CardFooter className="flex items-center gap-2">
			<Button
				onClick={async () => {
					setLoading(true);
					const res = await client.oauth2.consent({
						accept: true,
					});
					setLoading(false);
					if (res.data?.redirectURI) {
						window.location.href = res.data.redirectURI;
						return;
					}
					toast.error("Failed to authorize");
				}}
			>
				{loading ? <Loader2 size={15} className="animate-spin" /> : "Authorize"}
			</Button>
			<Button
				variant="outline"
				onClick={async () => {
					const res = await client.oauth2.consent({
						accept: false,
					});
					if (res.data?.redirectURI) {
						window.location.href = res.data.redirectURI;
						return;
					}
					toast.error("Failed to cancel");
				}}
			>
				Cancel
			</Button>
		</CardFooter>
	);
}
