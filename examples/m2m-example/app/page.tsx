"use client";

import { useState, useEffect } from "react";

interface M2MClient {
  id: string;
  clientId: string;
  name?: string;
  scopes?: string[];
  metadata?: Record<string, any>;
  expiresAt?: string;
  createdAt: string;
  startingCharacters?: string;
}

export default function M2MExample() {
  const [clients, setClients] = useState<M2MClient[]>([]);
  const [newClient, setNewClient] = useState({
    name: "",
    scopes: "",
    metadata: "",
    expiresIn: 365,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const response = await fetch("/api/m2m/clients");
      const data = await response.json();
      setClients(data);
    } catch (error) {
      console.error("Failed to load clients:", error);
    }
  };

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const scopes = newClient.scopes
        .split(" ")
        .filter((scope) => scope.trim())
        .map((scope) => scope.trim());

      const metadata = newClient.metadata
        ? JSON.parse(newClient.metadata)
        : undefined;

      const response = await fetch("/api/m2m/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newClient.name,
          scopes,
          metadata,
          expiresIn: newClient.expiresIn,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(
          `Client created successfully! Client ID: ${data.clientId}, Secret: ${data.clientSecret}`
        );
        setNewClient({
          name: "",
          scopes: "",
          metadata: "",
          expiresIn: 365,
        });
        loadClients();
      } else {
        setMessage(`Error: ${data.error || "Failed to create client"}`);
      }
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const testToken = async (clientId: string) => {
    try {
      const response = await fetch("/api/m2m/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: "test-secret", // This will fail, but shows the flow
        }),
      });

      const data = await response.json();
      alert(`Token response: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">M2M Authentication Example</h1>

      {/* Create Client Form */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold mb-4">Create M2M Client</h2>
        <form onSubmit={createClient} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Client Name *</label>
            <input
              type="text"
              value={newClient.name}
              onChange={(e) =>
                setNewClient({ ...newClient, name: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Scopes (space-separated)
            </label>
            <input
              type="text"
              value={newClient.scopes}
              onChange={(e) =>
                setNewClient({ ...newClient, scopes: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="read write admin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Metadata (JSON)
            </label>
            <textarea
              value={newClient.metadata}
              onChange={(e) =>
                setNewClient({ ...newClient, metadata: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded"
              placeholder='{"environment": "production"}'
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Expiration (days)
            </label>
            <input
              type="number"
              value={newClient.expiresIn}
              onChange={(e) =>
                setNewClient({
                  ...newClient,
                  expiresIn: parseInt(e.target.value),
                })
              }
              className="w-full p-2 border border-gray-300 rounded"
              min="1"
              max="730"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Client"}
          </button>
        </form>

        {message && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <pre className="text-sm">{message}</pre>
          </div>
        )}
      </div>

      {/* Clients List */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">M2M Clients</h2>
        {clients.length === 0 ? (
          <p className="text-gray-500">No clients created yet.</p>
        ) : (
          <div className="space-y-4">
            {clients.map((client) => (
              <div
                key={client.id}
                className="border border-gray-200 p-4 rounded"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{client.name}</h3>
                    <p className="text-sm text-gray-600">
                      Client ID: {client.clientId}
                    </p>
                    {client.startingCharacters && (
                      <p className="text-sm text-gray-600">
                        Secret starts with: {client.startingCharacters}...
                      </p>
                    )}
                    {client.scopes && client.scopes.length > 0 && (
                      <p className="text-sm text-gray-600">
                        Scopes: {client.scopes.join(", ")}
                      </p>
                    )}
                    {client.metadata && (
                      <p className="text-sm text-gray-600">
                        Metadata: {JSON.stringify(client.metadata)}
                      </p>
                    )}
                    {client.expiresAt && (
                      <p className="text-sm text-gray-600">
                        Expires: {new Date(client.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      Created: {new Date(client.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => testToken(client.clientId)}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    Test Token
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 bg-blue-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Usage Instructions</h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold">1. Create a Client</h3>
            <p>Use the form above to create an M2M client with appropriate scopes.</p>
          </div>

          <div>
            <h3 className="font-semibold">2. Get Access Token</h3>
            <p>
              Use the client credentials to get an access token:
            </p>
            <pre className="bg-gray-100 p-2 rounded mt-2 text-xs overflow-x-auto">
{`curl -X POST /api/m2m/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "client_credentials",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "scope": "read write"
  }'`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold">3. Use the Token</h3>
            <p>
              Include the access token in your API requests:
            </p>
            <pre className="bg-gray-100 p-2 rounded mt-2 text-xs overflow-x-auto">
{`curl -H "Authorization: Bearer your-access-token" \\
  https://your-api.com/protected-endpoint`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
} 