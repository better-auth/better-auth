"use client";
import { alphabet, generateRandomString } from "oslo/crypto";
import { useState } from "react";
import { Button } from "./ui/button";
export const GenerateSecret = () => {
	const [generated, setGenerated] = useState(false);
	return (
		<div className="my-2">
			<Button
				variant="outline"
				size="sm"
				disabled={generated}
				onClick={() => {
					const elements = document.getElementsByTagName("code"); // or any other selector
					for (let i = 0; i < elements.length; i++) {
						if (elements[i].textContent === "BETTER_AUTH_SECRET=") {
							elements[i].textContent =
								`BETTER_AUTH_SECRET=${generateRandomString(
									32,
									alphabet("A-Z", "a-z", "0-9"),
								)}`;
							setGenerated(true);
							setTimeout(() => {
								elements[i].textContent = "BETTER_AUTH_SECRET=";
								setGenerated(false);
							}, 5000);
						}
					}
				}}
			>
				{generated ? "Generated" : "Generate Secret"}
			</Button>
		</div>
	);
};
