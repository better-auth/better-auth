"use client";

import { authClient } from "@/lib/client";
import { Button } from "./ui/button";

export const SignOut = () => {
	return (
		<Button
			onClick={async () => {
				await authClient.signOut();
			}}
		>
			Sign Out
		</Button>
	);
};
