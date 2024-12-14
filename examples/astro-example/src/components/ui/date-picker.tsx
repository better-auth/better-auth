import { cn } from "@/libs/cn";
import type {
	DatePickerContentProps,
	DatePickerInputProps,
	DatePickerRangeTextProps,
	DatePickerRootProps,
	DatePickerTableCellProps,
	DatePickerTableCellTriggerProps,
	DatePickerTableHeaderProps,
	DatePickerTableProps,
	DatePickerTableRowProps,
	DatePickerViewControlProps,
	DatePickerViewProps,
	DatePickerViewTriggerProps,
} from "@ark-ui/solid";
import { DatePicker as DatePickerPrimitive } from "@ark-ui/solid";
import type { VoidProps } from "solid-js";
import { splitProps } from "solid-js";
import { buttonVariants } from "./button";

export const DatePickerLabel = DatePickerPrimitive.Label;
export const DatePickerTableHead = DatePickerPrimitive.TableHead;
export const DatePickerTableBody = DatePickerPrimitive.TableBody;
export const DatePickerClearTrigger = DatePickerPrimitive.ClearTrigger;
export const DatePickerYearSelect = DatePickerPrimitive.YearSelect;
export const DatePickerMonthSelect = DatePickerPrimitive.MonthSelect;
export const DatePickerContext = DatePickerPrimitive.Context;
export const DatePickerRootProvider = DatePickerPrimitive.RootProvider;

export const DatePicker = (props: DatePickerRootProps) => {
	return (
		<DatePickerPrimitive.Root
			format={(e) => {
				const parsedDate = new Date(Date.parse(e.toString()));

				const normalizedDate = new Date(
					parsedDate.getUTCFullYear(),
					parsedDate.getUTCMonth(),
					parsedDate.getUTCDate(),
				);

				return new Intl.DateTimeFormat("en-US", {
					dateStyle: "long",
				}).format(normalizedDate);
			}}
			{...props}
		/>
	);
};

export const DatePickerView = (props: DatePickerViewProps) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.View class={cn("space-y-4", local.class)} {...rest} />
	);
};

export const DatePickerViewControl = (props: DatePickerViewControlProps) => {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<DatePickerPrimitive.ViewControl
			class={cn("flex items-center justify-between", local.class)}
			{...rest}
		>
			<DatePickerPrimitive.PrevTrigger
				class={cn(
					buttonVariants({
						variant: "outline",
					}),
					"h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					viewBox="0 0 24 24"
				>
					<path
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						d="m15 6l-6 6l6 6"
					/>
					<title>Previous</title>
				</svg>
			</DatePickerPrimitive.PrevTrigger>
			{local.children}
			<DatePickerPrimitive.NextTrigger
				class={cn(
					buttonVariants({
						variant: "outline",
					}),
					"h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					viewBox="0 0 24 24"
				>
					<path
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						d="m9 6l6 6l-6 6"
					/>
					<title>Next</title>
				</svg>
			</DatePickerPrimitive.NextTrigger>
		</DatePickerPrimitive.ViewControl>
	);
};

export const DatePickerRangeText = (
	props: VoidProps<DatePickerRangeTextProps>,
) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.RangeText
			class={cn("text-sm font-medium", local.class)}
			{...rest}
		/>
	);
};

export const DatePickerTable = (props: DatePickerTableProps) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.Table
			class={cn("w-full border-collapse space-y-1", local.class)}
			{...rest}
		/>
	);
};

export const DatePickerTableRow = (props: DatePickerTableRowProps) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.TableRow
			class={cn("mt-2 flex w-full", local.class)}
			{...rest}
		/>
	);
};

export const DatePickerTableHeader = (props: DatePickerTableHeaderProps) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.TableHeader
			class={cn(
				"w-8 flex-1 text-[0.8rem] font-normal text-muted-foreground",
				local.class,
			)}
			{...rest}
		/>
	);
};

export const DatePickerTableCell = (props: DatePickerTableCellProps) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.TableCell
			class={cn(
				"flex-1 p-0 text-center text-sm",
				"has-[[data-in-range]]:bg-accent has-[[data-in-range]]:first-of-type:rounded-l-md has-[[data-in-range]]:last-of-type:rounded-r-md",
				"has-[[data-range-end]]:rounded-r-md has-[[data-range-start]]:rounded-l-md",
				"has-[[data-outside-range][data-in-range]]:bg-accent/50",
				local.class,
			)}
			{...rest}
		/>
	);
};

export const DatePickerTableCellTrigger = (
	props: DatePickerTableCellTriggerProps,
) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.TableCellTrigger
			class={cn(
				buttonVariants({ variant: "ghost" }),
				"size-8 w-full p-0 font-normal data-[selected]:opacity-100",
				"data-[today]:bg-accent data-[today]:text-accent-foreground",
				"[&:is([data-today][data-selected])]:bg-primary [&:is([data-today][data-selected])]:text-primary-foreground",
				"data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary data-[selected]:hover:text-primary-foreground",
				"data-[disabled]:text-muted-foreground data-[disabled]:opacity-50",
				"data-[outside-range]:text-muted-foreground data-[outside-range]:opacity-50",
				"[&:is([data-outside-range][data-in-range])]:bg-accent/50 [&:is([data-outside-range][data-in-range])]:text-muted-foreground [&:is([data-outside-range][data-in-range])]:opacity-30",
				local.class,
			)}
			{...rest}
		/>
	);
};

export const DatePickerViewTrigger = (props: DatePickerViewTriggerProps) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<DatePickerPrimitive.ViewTrigger
			class={cn(buttonVariants({ variant: "ghost" }), "h-7", local.class)}
			{...rest}
		/>
	);
};

export const DatePickerContent = (props: DatePickerContentProps) => {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<DatePickerPrimitive.Positioner>
			<DatePickerPrimitive.Content
				class={cn(
					"rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50",
					local.class,
				)}
				{...rest}
			>
				{local.children}
			</DatePickerPrimitive.Content>
		</DatePickerPrimitive.Positioner>
	);
};

export const DatePickerInput = (props: DatePickerInputProps) => {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<DatePickerPrimitive.Control class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
			<DatePickerPrimitive.Input
				class={cn(
					"w-full appearance-none bg-transparent outline-none",
					local.class,
				)}
				{...rest}
			/>
			<DatePickerPrimitive.Trigger class="transition-shadow focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-1 h-4 w-4"
					viewBox="0 0 24 24"
				>
					<path
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm12-4v4M8 3v4m-4 4h16m-9 4h1m0 0v3"
					/>
					<title>Calendar</title>
				</svg>
			</DatePickerPrimitive.Trigger>
		</DatePickerPrimitive.Control>
	);
};
