import { Pricing } from "@/components/pricing";

const demoPlans = [
	{
		name: "Plus",
		price: "20",
		yearlyPrice: "16",
		period: "per month",
		features: [
			"Up to 10 projects",
			"Basic analytics",
			"48-hour support response time",
			"Limited API access",
		],
		description: "Perfect for individuals and small projects",
		buttonText: "Start Free Trial",
		href: "/sign-up",
		isPopular: false,
	},
	{
		name: "Pro",
		price: "50",
		yearlyPrice: "40",
		period: "per month",
		features: [
			"Unlimited projects",
			"Advanced analytics",
			"24-hour support response time",
			"Full API access",
			"Priority support",
		],
		description: "Ideal for growing teams and businesses",
		buttonText: "Get Started",
		href: "/sign-up",
		isPopular: true,
	},
];

export default function Page() {
	return <Pricing plans={demoPlans} />;
}
