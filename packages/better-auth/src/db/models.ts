export interface User {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface DefaultSession {
	user: User;
}

export interface Session extends DefaultSession {}
