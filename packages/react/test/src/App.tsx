import "./index.css";
import form from "../../src/components/methods/form";
import { memo } from "react";

const App = memo(function App() {
	const m = [
		"input",
		"checkbox",
		"calender",
		"otp",
		"radio",
		"slider",
		"select",
		"switch",
	];
	return form({
		fields: [
			{
				label: "test",
				id: "test",
				props: {},
				field: "input",
			},
			{
				label: "checkbox",
				id: "checkbox",
				props: {},
				field: "checkbox",
			},
			{
				label: "calender",
				id: "calender",
				props: {},
				field: "calender",
			},
			{
				label: "otp",
				id: "otp",
				props: {
					maxLength: 6,
				},
				field: "otp",
				extra: {
					options: [
						{
							id: "otp-group-1",
							type: "group",
							props: {},
							slots: [
								{
									id: 1,
									props: {},
								},
								{
									id: 2,
									props: {},
								},
								{
									id: 3,
									props: {},
								},
							],
						},
						{
							id: "otp-separator",
							type: "separator",
							props: {},
						},
						{
							id: "otp-group-2",
							type: "group",
							props: {},
							slots: [
								{
									id: 4,
									props: {},
								},
								{
									id: 5,
									props: {},
								},
								{
									id: 6,
									props: {},
								},
							],
						},
					],
				},
			},
			{
				label: "radio",
				id: "radio",
				props: {},
				field: "radio",
				extra: {
					options: [
						{
							id: "radio-1",
							label: "radio-1",
						},
						{
							id: "radio-2",
							label: "radio-2",
						},
						{
							id: "radio-3",
							label: "radio-3",
						},
					],
				},
			},
			{
				label: "slider",
				id: "slider",
				props: {},
				field: "slider",
			},
			{
				label: "select",
				id: "select",
				props: {},
				field: "select",
				extra: {
					options: [
						{
							id: "select-1",
							label: "select-1",
							type: "item",
						},
						{
							id: "select-2",
							label: "select-2",
							type: "item",
						},
						{
							id: "select-3",
							label: "select-3",
							type: "item",
						},
					],
				},
			},
			{
				label: "switch",
				id: "switch",
				props: {},
				field: "switch",
			},
		],
		button: {
			label: "button test",
			endpoint: (...args: any) => {
				console.log(`ARGS: ${JSON.stringify(args)}`);
			},
			props: {},
		},
		plugins: [],
	});
});

export default App;
export { App };
