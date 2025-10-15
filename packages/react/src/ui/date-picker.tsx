"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

type Options = {
	styles?: {
		button?: string;
		content?: string;
		calender?: string;
	};
	props: {
		button?: React.ComponentProps<typeof Button>;
		content?: React.ComponentProps<typeof PopoverContent>;
		calender?: React.ComponentProps<typeof Calendar>
	};
	buttonText?: string;
	onValueChange?: (date: Date) => void;
};

export function DatePicker({styles, buttonText}: Options) {
	const [open, setOpen] = React.useState(false);
	const [date, setDate] = React.useState<Date | undefined>(undefined);
  const {
			button: buttonStyle = "w-48 justify-between font-normal",
			content: contentStyle = "w-auto overflow-hidden p-0",
			calender: calenderStyle = "w-auto overflow-hidden p-0",
		} = styles ?? {};

	return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						id="date"
						className={buttonStyle}
					>
						{buttonText ?? (date ? date.toLocaleDateString() : "Select date")}
						<ChevronDownIcon />
					</Button>
				</PopoverTrigger>
				<PopoverContent className={contentStyle} align="start">
					<Calendar
						mode="single"
						selected={date}
						captionLayout="dropdown"
						onSelect={(date) => {
							setDate(date);
							setOpen(false);
						}}
            className={calenderStyle}
					/>
				</PopoverContent>
			</Popover>
	);
}
