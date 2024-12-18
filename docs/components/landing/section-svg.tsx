const SectionSvg = ({
	crossesOffset,
}: {
	crossesOffset: string;
}) => {
	return (
		<>
			<PlusSvg
				className={`hidden absolute -top-[0.3125rem] ${
					crossesOffset && crossesOffset
				} pointer-events-none lg:block lg:left-[3.6825rem]`}
			/>

			<PlusSvg
				className={`hidden absolute  -top-[0.3125rem] right-[1.4625rem] ${
					crossesOffset && crossesOffset
				} pointer-events-none lg:block lg:right-[3.20rem]`}
			/>
		</>
	);
};

export default SectionSvg;

export const PlusSvg = ({ className = "" }) => {
	return (
		<svg className={`${className} || ""`} width="11" height="11" fill="none">
			<path
				d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
				fill="#878787"
			/>
		</svg>
	);
};
