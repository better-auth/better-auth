import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { useUser } from "./user-provider";

export function Profile() {
  const { user, setUser } = useUser();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 bg-background p-2.5 border border-border rounded-md drop-shadow-md">
      <Avatar>
        <AvatarImage src={user.image ?? undefined} alt={user.name} />
        <AvatarFallback>
          {(user.name || user.email)?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <p className="flex flex-col max-w-46 leading-tight">
        <span className="font-medium truncate">{user.name}</span>
        <span className="text-sm text-muted-foreground truncate">
          {user.email}
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void window.signOut();
          setUser(null);
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          className="size-3.5"
        >
          <path d="m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        </svg>
        Sign Out
      </Button>
    </div>
  );
}
