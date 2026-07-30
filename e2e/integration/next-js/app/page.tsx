import Link from "next/link";

export default function HomePage() {
	return (
		<main>
			<Link href="/session" prefetch={false}>
				Read session
			</Link>
		</main>
	);
}
