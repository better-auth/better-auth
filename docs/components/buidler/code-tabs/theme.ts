import { PrismTheme } from "prism-react-renderer";

const theme: PrismTheme = {
	plain: {
		color: "#e0e0e0",
		backgroundColor: "#1a1a1a",
	},
	styles: [
		{
			types: ["comment", "prolog", "doctype", "cdata"],
			style: {
				color: "#999999",
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
				color: "#a3d9ff", // Soft blue for strings
			},
		},
		{
			types: ["punctuation", "operator"],
			style: {
				color: "#cccccc",
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
				color: "#b3b3b3",
			},
		},
		{
			types: ["atrule", "keyword", "attr-name", "selector"],
			style: {
				color: "#e6e6e6",
				fontWeight: "bold", // Bold for keywords
			},
		},
		{
			types: ["function", "deleted", "tag"],
			style: {
				color: "#70c0ff", // Soft blue for functions
			},
		},
		{
			types: ["function-variable"],
			style: {
				color: "#a6a6a6",
			},
		},
		{
			types: ["tag", "selector", "keyword"],
			style: {
				color: "#f0f0f0",
			},
		},
	],
};

export default theme;
