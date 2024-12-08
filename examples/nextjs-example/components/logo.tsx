import { SVGProps } from "react";

export const Logo = (props: SVGProps<any>) => {
	return (
		<svg
			width="60"
			height="45"
			viewBox="0 0 60 45"
			fill="none"
			className="w-5 h-5"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M0 0H15V15H30V30H15V45H0V30V15V0ZM45 30V15H30V0H45H60V15V30V45H45H30V30H45Z"
				className="fill-black dark:fill-white"
			/>
		</svg>
	);
};
