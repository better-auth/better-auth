import type { PrismTheme } from "prism-react-renderer";

const theme: PrismTheme = {
	plain: {
		color: "#d0d0d0",
		backgroundColor: "#000000", // Changed to true black
	},
	styles: [
		{
			types: ["comment", "prolog", "doctype", "cdata"],
			style: {
				color: "#555555",
				fontStyle: "italic",
			},
		},
		{
			types: ["namespace"],
			style: {
				opacity: 0.7,
			},
		},
		{
			types: ["string", "attr-value"],
			style: {
				color: "#8ab4f8", // Darker soft blue for strings
			},
		},
		{
			types: ["punctuation", "operator"],
			style: {
				color: "#888888",
			},
		},
		{
			types: [
				"entity",
				"url",
				"symbol",
				"number",
				"boolean",
				"variable",
				"constant",
				"property",
				"regex",
				"inserted",
			],
			style: {
				color: "#a0a0a0",
			},
		},
		{
			types: ["atrule", "keyword", "attr-name", "selector"],
			style: {
				color: "#c5c5c5",
				fontWeight: "bold",
			},
		},
		{
			types: ["function", "deleted", "tag"],
			style: {
				color: "#7aa2f7", // Darker soft blue for functions
			},
		},
		{
			types: ["function-variable"],
			style: {
				color: "#9e9e9e",
			},
		},
		{
			types: ["tag", "selector", "keyword"],
			style: {
				color: "#cccccc", // Adjusted to a slightly lighter gray for better contrast on true black
			},
		},
	],
};

export default theme;
