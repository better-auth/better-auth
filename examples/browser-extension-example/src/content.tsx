import cssText from "data-text:~style.css";
import type { PlasmoCSConfig } from "plasmo";
import { useState } from "react";
import { PageControls } from "./popup";
import { Home } from "./components/Home";
import { Toaster } from "sonner";
import { SignIn } from "./components/SignIn";
import { SignUp } from "./components/SignUp";

export const config: PlasmoCSConfig = {
	matches: ["https://www.plasmo.com/*"],
};

export const getStyle = () => {
	const style = document.createElement("style");
	style.textContent = cssText;
	return style;
};

const PlasmoOverlay = () => {
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
};

export default PlasmoOverlay;
