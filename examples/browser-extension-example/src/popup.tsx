import "@/style.css";

import { useState } from "react";
import { toast, Toaster } from "sonner";

import { Home } from "./components/Home";
import { SignIn } from "./components/SignIn";
import { SignUp } from "./components/SignUp";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { authClient } from "./auth/auth-client";

function IndexPopup() {
	const [page, setPage] = useState<"home" | "sign-in" | "sign-up">("home");

	return (
		<div className="min-w-[400px] w-fit h-fit min-h-[500px] overflow-hidden dark bg-background text-foreground">
			<Toaster />
			{page === "home" && <Home setPage={setPage} />}
			{page === "sign-in" && <SignIn setPage={setPage} />}
			{page === "sign-up" && <SignUp setPage={setPage} />}
			<PageControls setPage={setPage} page={page} />
		</div>
	);
}

export default IndexPopup;

export function PageControls({
	setPage,
	page,
}: {
	setPage: (page: "home" | "sign-in" | "sign-up") => void;
	page: "home" | "sign-in" | "sign-up";
}) {
	return (
		<div className="flex flex-col w-full gap-5 px-10 mt-5 h-fit">
			<Separator />
			<div className="flex justify-center gap-4">
				{page === "home" && (
					<>
						<Button onClick={() => setPage("sign-in")}>Sign-in</Button>
						<Button onClick={() => setPage("sign-up")}>Sign-Up</Button>
						<Button
							onClick={() => {
								authClient.signOut().then(({ data, error }) => {
									if (error) {
										toast.error(error.message);
									} else {
										toast.success("You've been signed out");
									}
								});
							}}
						>
							Sign-Out
						</Button>
					</>
				)}
				{page === "sign-in" && (
					<>
						<Button onClick={() => setPage("sign-up")}>Sign-Up</Button>
						<Button onClick={() => setPage("home")}>Home</Button>
					</>
				)}
				{page === "sign-up" && (
					<>
						<Button onClick={() => setPage("sign-in")}>Sign-in</Button>
						<Button onClick={() => setPage("home")}>Home</Button>
					</>
				)}
			</div>

			<div className="flex justify-center bg-background">
				<a
					href="https://www.better-auth.com/docs/integrations/browser-extensions"
					target="_blank"
					className="underline"
				>
					Learn more about better-auth extensions
				</a>
			</div>
			<div className="h-5"></div>
		</div>
	);
}
