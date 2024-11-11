export const secret = {
    MONGODB_URI: new sst.Secret("MONGODB_URI"),
    GOOGLE_CLIENT_ID: new sst.Secret("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: new sst.Secret("GOOGLE_CLIENT_SECRET"),
};

export const allSecrets = Object.values(secret);

/*
npx sst secret set MONGODB_URI "mongodb+srv://admin:admin@cluster0.xqzqx.mongodb.net/?retryWrites=true&w=majority"
npx sst secret set GOOGLE_CLIENT_ID "1234567890"
npx sst secret set GOOGLE_CLIENT_SECRET "1234567890"

refer : https://sst.dev/docs/component/secret/
*/