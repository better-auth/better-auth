"use client";

import { client } from "@/lib/auth/client";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

export const SignOut = () => {
	const router = useRouter();
	return (
		<Button
			onClick={async () => {
				await client.signOut();
				router.refresh();
			}}
		>
			Signout
		</Button>
	);
};
