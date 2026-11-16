import { signUp } from "../actions";

export default function HomePage() {
	return (
		<form action={signUp}>
			<label>
				Name <input name="name" />
			</label>
			<label>
				Email <input name="email" type="email" />
			</label>
			<label>
				Password <input name="password" type="password" />
			</label>
			<button type="submit">Sign up</button>
		</form>
	);
}

export const getConfig = async () => {
	return { render: "dynamic" } as const;
};
