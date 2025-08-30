import { Plus } from "lucide-react";

const SectionSvg = ({ crossesOffset }: { crossesOffset: string }) => {
	return (
		<>
			<Plus
				className={`hidden absolute -top-[0.3125rem] h-6 w-6 ${
					crossesOffset && crossesOffset
				} pointer-events-none lg:block lg:left-[3.275rem] text-neutral-300 dark:text-neutral-600 translate-y-[.5px]`}
			/>

			<Plus
				className={`hidden absolute -top-[0.3125rem] h-6 w-6 right-[1.4625rem] ${
					crossesOffset && crossesOffset
				} pointer-events-none lg:block lg:right-[2.7750rem] text-neutral-300 dark:text-neutral-600 translate-y-[.5px]`}
			/>
		</>
	);
};

export default SectionSvg;
