import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ContributorsProps {
	usernames: string[];
}

export function Contributors({ usernames }: ContributorsProps) {
	return (
		<div className="not-prose my-8">
			<div className="flex flex-wrap gap-3 items-center justify-center">
				{usernames.map((username) => (
					<a
						href={`https://github.com/${username}`}
						target="_blank"
						rel="noopener noreferrer"
						key={username}
						className="group relative transition-transform hover:scale-110"
						title={`@${username}`}
					>
						<Avatar className="h-12 w-12 ring-2 ring-border group-hover:ring-primary transition-all">
							<AvatarImage
								src={`https://github.com/${username}.png`}
								alt={`@${username}`}
							/>
							<AvatarFallback>
								{username.charAt(0).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					</a>
				))}
			</div>
		</div>
	);
}
