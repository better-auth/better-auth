await fetch("http://localhost:4000/api/auth/sign-up/email", {
	method: "POST",
	body: JSON.stringify({
		email: "test-2@test.com",
		password: "password",
		name: "test-2",
	}),
	headers: {
		"content-type": "application/json",
	},
})
	.then((res) => res.json())
	.then((data) => console.log(data));
