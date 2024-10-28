import { createFileRoute } from "@tanstack/react-router";
import { signIn } from "~/lib/client/auth";

export const Route = createFileRoute('/auth/signin')({
  component: SignIn,
})

function SignIn() {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    signIn.email({
      email: data.get("email") as string,
      password: data.get("password") as string,
    });
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="text" name="email" placeholder="Email" />
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Sign In</button>
      </form>
    </div>
  )
}