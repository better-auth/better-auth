import {
	Body,
	Button,
	Container,
	Column,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
	Section,
	Text,
	Tailwind,
} from "@react-email/components";

interface BetterAuthInviteUserEmailProps {
	username?: string;
	invitedByUsername?: string;
	invitedByEmail?: string;
	teamName?: string;
	teamImage?: string;
	inviteLink?: string;
}

export const InviteUserEmail = ({
	username,
	invitedByUsername,
	invitedByEmail,
	teamName,
	teamImage,
	inviteLink,
}: BetterAuthInviteUserEmailProps) => {
	const previewText = `Join ${invitedByUsername} on BetterAuth`;
	return (
		<Html>
			<Head />
			<Preview>{previewText}</Preview>
			<Tailwind>
				<Body className="bg-white my-auto mx-auto font-sans px-2">
					<Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
						<Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
							Join <strong>{invitedByUsername}</strong> on{" "}
							<strong>Better Auth.</strong>
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello there,
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							<strong>{invitedByUsername}</strong> (
							<Link
								href={`mailto:${invitedByEmail}`}
								className="text-blue-600 no-underline"
							>
								{invitedByEmail}
							</Link>
							) has invited you to the <strong>{teamName}</strong> team on{" "}
							<strong>Better Auth</strong>.
						</Text>
						<Section>
							{teamImage ? (
								<Row>
									<Column align="left">
										<Img
											className="rounded-full"
											src={teamImage}
											width="64"
											height="64"
											fetchPriority="high"
										/>
									</Column>
								</Row>
							) : null}
						</Section>
						<Section className="text-center mt-[32px] mb-[32px]">
							<Button
								className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
								href={inviteLink}
							>
								Join the team
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							or copy and paste this URL into your browser:{" "}
							<Link href={inviteLink} className="text-blue-600 no-underline">
								{inviteLink}
							</Link>
						</Text>
						<Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
						<Text className="text-[#666666] text-[12px] leading-[24px]">
							This invitation was intended for{" "}
							<span className="text-black">{username}</span>. If you were not
							expecting this invitation, you can ignore this email.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export function reactInvitationEmail(props: BetterAuthInviteUserEmailProps) {
	console.log(props);
	return <InviteUserEmail {...props} />;
}
