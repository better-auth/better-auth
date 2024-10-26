import badgestyle from "./badge.module.css";
export const PulicBetaBadge = ({ text }: { text?: string }) => {
	return (
		<div className="flex flex-col">
			<div className={badgestyle.beta}>
				<span className={badgestyle.top_key}></span>
				<span className={badgestyle.text}>{text || "BETA"}</span>
				<span className={badgestyle.bottom_key_1}></span>
				<span className={badgestyle.bottom_key_2}></span>
			</div>
			<div className="flex items-center gap-1 mt-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="0.8em"
					height="0.8em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M13 4V2c4.66.5 8.33 4.19 8.85 8.85c.6 5.49-3.35 10.43-8.85 11.03v-2c3.64-.45 6.5-3.32 6.96-6.96A7.994 7.994 0 0 0 13 4m-7.33.2A9.8 9.8 0 0 1 11 2v2.06c-1.43.2-2.78.78-3.9 1.68zM2.05 11a9.8 9.8 0 0 1 2.21-5.33L5.69 7.1A8 8 0 0 0 4.05 11zm2.22 7.33A10.04 10.04 0 0 1 2.06 13h2c.18 1.42.75 2.77 1.63 3.9zm1.4 1.41l1.39-1.37h.04c1.13.88 2.48 1.45 3.9 1.63v2c-1.96-.21-3.82-1-5.33-2.26M12 17l1.56-3.42L17 12l-3.44-1.56L12 7l-1.57 3.44L7 12l3.43 1.58z"
					></path>
				</svg>
				<span className="text-xs text-opacity-75">v1 - nov. 22</span>
			</div>
		</div>
	);
};
