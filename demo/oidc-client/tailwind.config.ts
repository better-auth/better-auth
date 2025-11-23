import type { Config } from "tailwindcss";

const config = {
	darkMode: "class",
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
} satisfies Config;

export default config;
