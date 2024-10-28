import { createFileRoute } from "@tanstack/react-router";
import { signUp } from "~/lib/client/auth";

export const Route = createFileRoute('/auth/signup')({
  component: SignUp,
})

function SignUp() {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    signUp.email({
      name: data.get("name") as string,
      email: data.get("email") as string,
      password: data.get("password") as string,
    });
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="text" name="email" placeholder="Email" />
        <input type="text" name="name" placeholder="Name" />
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Sign Up</button>
      </form>
    </div>
  )
}