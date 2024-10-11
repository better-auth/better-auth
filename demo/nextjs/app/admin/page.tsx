"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type User = {
	id: string;
	email: string;
	name: string;
	role: "admin" | "user";
};

const mockUsers: User[] = [
	{ id: "1", email: "admin@example.com", name: "Admin User", role: "admin" },
	{ id: "2", email: "user@example.com", name: "Regular User", role: "user" },
];

export default function AdminDashboard() {
	const [users, setUsers] = useState<User[]>(mockUsers);
	const [newUser, setNewUser] = useState({
		email: "",
		password: "",
		name: "",
		role: "user" as const,
	});

	const handleCreateUser = (e: React.FormEvent) => {
		e.preventDefault();
		const id = (users.length + 1).toString();
		setUsers([...users, { ...newUser, id }]);
		setNewUser({ email: "", password: "", name: "", role: "user" });
		toast.success("User created successfully");
	};

	const handleDeleteUser = (id: string) => {
		setUsers(users.filter((user) => user.id !== id));
		toast.success("User deleted successfully");
	};

	const handleRevokeSessions = (id: string) => {
		toast.success("Sessions revoked for user");
	};

	const handleImpersonateUser = (id: string) => {
		toast.success("Impersonating user");
	};

	return (
		<div className="container mx-auto p-4">
			<h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>

			<form onSubmit={handleCreateUser} className="mb-8 p-4 border rounded-lg">
				<h2 className="text-xl font-semibold mb-4">Create New User</h2>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							value={newUser.email}
							onChange={(e) =>
								setNewUser({ ...newUser, email: e.target.value })
							}
							required
						/>
					</div>
					<div>
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={newUser.password}
							onChange={(e) =>
								setNewUser({ ...newUser, password: e.target.value })
							}
							required
						/>
					</div>
					<div>
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							value={newUser.name}
							onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
							required
						/>
					</div>
					<div>
						<Label htmlFor="role">Role</Label>
						<Select
							value={newUser.role}
							onValueChange={(value: "admin" | "user") =>
								setNewUser({ ...newUser, role: value as "user" })
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="user">User</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<Button type="submit" className="mt-4">
					Create User
				</Button>
			</form>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Email</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{users.map((user) => (
						<TableRow key={user.id}>
							<TableCell>{user.email}</TableCell>
							<TableCell>{user.name}</TableCell>
							<TableCell>{user.role}</TableCell>
							<TableCell>
								<div className="flex space-x-2">
									<Button
										variant="destructive"
										onClick={() => handleDeleteUser(user.id)}
									>
										Delete
									</Button>
									<Button
										variant="outline"
										onClick={() => handleRevokeSessions(user.id)}
									>
										Revoke Sessions
									</Button>
									<Button
										variant="secondary"
										onClick={() => handleImpersonateUser(user.id)}
									>
										Impersonate
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
