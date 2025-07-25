<script lang="ts">
import { Calendar as CalendarPrimitive } from "bits-ui";
import { cn } from "$lib/utils.js";
import CalendarCell from "./calendar-cell.svelte";
import CalendarDay from "./calendar-day.svelte";
import CalendarGridBody from "./calendar-grid-body.svelte";
import CalendarGridHead from "./calendar-grid-head.svelte";
import CalendarGridRow from "./calendar-grid-row.svelte";
import CalendarGrid from "./calendar-grid.svelte";
import CalendarHeadCell from "./calendar-head-cell.svelte";
import CalendarHeader from "./calendar-header.svelte";
import CalendarHeading from "./calendar-heading.svelte";
import CalendarMonths from "./calendar-months.svelte";
import CalendarNextButton from "./calendar-next-button.svelte";
import CalendarPrevButton from "./calendar-prev-button.svelte";

type $$Props = CalendarPrimitive.Props;
type $$Events = CalendarPrimitive.Events;

export let value: $$Props["value"] = undefined;
export let placeholder: $$Props["placeholder"] = undefined;
export let weekdayFormat: $$Props["weekdayFormat"] = "short";

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<CalendarPrimitive.Root
	bind:value
	bind:placeholder
	{weekdayFormat}
	class={cn("p-3", className)}
	{...$$restProps}
	on:keydown
	let:months
	let:weekdays
>
	<CalendarHeader>
		<CalendarPrevButton />
		<CalendarHeading />
		<CalendarNextButton />
	</CalendarHeader>
	<CalendarMonths>
		{#each months as month}
			<CalendarGrid>
				<CalendarGridHead>
					<CalendarGridRow class="flex">
						{#each weekdays as weekday}
							<CalendarHeadCell>
								{weekday.slice(0, 2)}
							</CalendarHeadCell>
						{/each}
					</CalendarGridRow>
				</CalendarGridHead>
				<CalendarGridBody>
					{#each month.weeks as weekDates}
						<CalendarGridRow class="mt-2 w-full">
							{#each weekDates as date}
								<CalendarCell {date}>
									<CalendarDay {date} month={month.value} />
								</CalendarCell>
							{/each}
						</CalendarGridRow>
					{/each}
				</CalendarGridBody>
			</CalendarGrid>
		{/each}
	</CalendarMonths>
</CalendarPrimitive.Root>
