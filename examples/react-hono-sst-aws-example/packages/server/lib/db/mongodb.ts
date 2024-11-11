// create mongoclinet reusable check if it's connected
import { MongoClient } from 'mongodb';
import { Resource } from 'sst'
let client: MongoClient | null = null;



export async function getMongoClient(): Promise<MongoClient> {
    if (!Resource.MONGODB_URI.value) {
        throw new Error('MONGO_URI environment variable is not set');
    }

    if (!client) {
        client = new MongoClient(Resource.MONGODB_URI.value);
        await client.connect();
    }

    return client;
}