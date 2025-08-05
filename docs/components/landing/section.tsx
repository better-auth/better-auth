import type React from "react";
import SectionSvg from "./section-svg";

const Icon = ({
	className,
	...rest
}: { className?: string; [key: string]: any }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			strokeWidth="1.5"
			stroke="currentColor"
			className={className}
			{...rest}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
		</svg>
	);
};

const Section = ({
	className,
	id,
	crosses,
	crossesOffset,
	customPaddings,
	children,
}: {
	className: string;
	id: string;
	crosses?: boolean;
	crossesOffset: string;
	customPaddings: boolean;
	children: React.ReactNode;
}) => {
	return (
		<div
			id={id}
			className={`
      relative
      ${customPaddings || `py-10 lg:py-16  ${crosses ? "" : ""}`}
      ${className || " "}`}
		>
			{children}

			<div className="hidden absolute top-0 left-5 w-[0.0625rem] h-[calc(100%_+_30px)] dark:bg-[#26242C] bg-stone-200  pointer-events-none lg:block lg:left-16 xl:left-16" />
			<div className="hidden absolute top-0 right-5 w-[0.0625rem] h-[calc(100%_+_30px)]  dark:bg-[#26242C] bg-stone-200  pointer-events-none lg:block lg:right-14 xl:right-14" />

			{crosses && (
				<>
					<SectionSvg crossesOffset={crossesOffset} />
				</>
			)}
		</div>
	);
};

export default Section;
