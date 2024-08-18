"use client";
import { setCounter } from "@/server/counter";
import { Button } from "./ui/button";
import { client } from "@/lib/client";

export async function AddCount() {
	return (
		<div className="flex items-center justify-center w-full gap-2">
			<Button
				onClick={async () => {
					const res = await setCounter({
						body: {
							count: 1,
						},
					});
					console.log(res);
				}}
			>
				+
			</Button>
			<Button
				onClick={async () => {
					const res = await client("@post/counter", {
						body: {
							count: 1,
						},
					});
					console.log(res);
				}}
			>
				+ (c)
			</Button>
		</div>
	);
}
