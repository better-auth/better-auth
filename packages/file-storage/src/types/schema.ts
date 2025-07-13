export type FileStorageSchema = {
    path: string
    fileId: string;
    fileName: string;
    metadata: Record<string, any> | null;
    providerURL: string;
    url: string;
    createdAt: Date;
    updatedAt: Date;
}