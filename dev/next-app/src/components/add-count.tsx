"use client";
import { Button } from "./ui/button";

export async function AddCount() {
	return (
		<div className="flex items-center justify-center w-full gap-2">
			<Button
				onClick={async () => {
					// const res = await setCounter({
					// 	body: {
					// 		count: 1,
					// 	},
					// });
				}}
			>
				+
			</Button>
			<Button
				onClick={async () => {
					// const res = await client("@post/counter", {
					// 	body: {
					// 		count: 1,
					// 	},
					// });
				}}
			>
				+ (c)
			</Button>
		</div>
	);
}
