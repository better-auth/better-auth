import type { TOCItemType } from "fumadocs-core/toc";
import type { StepperTOCItem } from "./stepper-toc";

export function groupTocItems(toc: TOCItemType[]): StepperTOCItem[] {
	const grouped: StepperTOCItem[] = [];
	for (const item of toc) {
		if (item.depth <= 2) {
			grouped.push({ ...item, subheadings: [] });
		} else if (grouped.length > 0) {
			grouped[grouped.length - 1].subheadings.push(item);
		} else {
			grouped.push({ ...item, subheadings: [] });
		}
	}
	return grouped;
}
