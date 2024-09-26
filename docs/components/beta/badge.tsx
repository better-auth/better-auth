import badgestyle from "./badge.module.css";
export const PulicBetaBadge = ({ text }: { text?: string }) => {
	return (
		<div className={badgestyle.beta}>
			<span className={badgestyle.top_key}></span>
			<span className={badgestyle.text}>{text || "BETA"}</span>
			<span className={badgestyle.bottom_key_1}></span>
			<span className={badgestyle.bottom_key_2}></span>
		</div>
	);
};
