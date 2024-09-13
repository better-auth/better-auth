import type React from "react";
import SectionSvg from "./section-svg";

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
      ${customPaddings ||
				`py-10 lg:py-16  ${crosses ? "" : ""}`
				} 
      ${className || " "}`}
		>
			{children}

			<div className="hidden absolute top-0 left-5 w-[0.0625rem] h-[calc(100%_+_30px)] dark:bg-[#26242C] bg-stone-200  pointer-events-none md:block lg:left-0 xl:left-0" />
			<div className="hidden absolute top-0 right-5 w-[0.0625rem] h-[calc(100%_+_30px)]  dark:bg-[#26242C] bg-stone-200  pointer-events-none md:block lg:right-0 xl:right-0" />

			{crosses && (
				<>
					<div
						className={`hidden absolute top-0 left-0 right-0 h-0.25 bg-[#26242C] ${crossesOffset && crossesOffset
							} pointer-events-none lg:block xl:left-0 right-0`}
					/>
					<SectionSvg crossesOffset={crossesOffset} />
				</>
			)}
		</div>
	);
};

export default Section;
