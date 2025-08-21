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

interface BetterAuthInvitationAcceptedEmailProps {
	acceptedByUsername?: string;
	acceptedByEmail?: string;
	teamName?: string;
	teamImage?: string;
	dashboardLink?: string;
}

export const InvitationAcceptedEmail = ({
	acceptedByUsername,
	acceptedByEmail,
	teamName,
	teamImage,
	dashboardLink,
}: BetterAuthInvitationAcceptedEmailProps) => {
	const previewText = `${acceptedByUsername} has joined your team on BetterAuth`;
	return (
		<Html>
			<Head />
			<Preview>{previewText}</Preview>
			<Tailwind>
				<Body className="bg-white my-auto mx-auto font-sans px-2">
					<Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
						<Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
							<strong>{acceptedByUsername}</strong> has joined{" "}
							<strong>{teamName}</strong> on Better Auth
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Great news! Your invitation has been accepted.
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							<strong>{acceptedByUsername}</strong> (
							<Link
								href={`mailto:${acceptedByEmail}`}
								className="text-blue-600 no-underline"
							>
								{acceptedByEmail}
							</Link>
							) has accepted your invitation to join the{" "}
							<strong>{teamName}</strong> team on <strong>Better Auth</strong>.
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
								href={dashboardLink}
							>
								View Team Dashboard
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							You can now collaborate with {acceptedByUsername} in your team
							workspace. They have been added with the appropriate permissions
							and can start contributing right away.
						</Text>
						<Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
						<Text className="text-[#666666] text-[12px] leading-[24px]">
							This notification was sent because you invited{" "}
							{acceptedByUsername} to join your team. If you have any questions,
							please contact your team administrator.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export function reactInvitationAcceptedEmail(
	props: BetterAuthInvitationAcceptedEmailProps,
) {
	return InvitationAcceptedEmail(props);
}
