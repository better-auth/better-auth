export type FileStorageSchema = {
    /**
     * File route path
     */
    path: string
    /**
     * File ID
     */
    fileId: string;
    /**
     * File name
     */
    fileName: string;
    /**
     * File metadata
     */
    metadata: Record<string, any> | null;
    /**
     * Provider URL
     */
    providerURL: string;
    /**
     * File URL
     */
    url: string;
    /**
     * Created at
     */
    createdAt: Date;
    /**
     * Updated at
     */
    updatedAt: Date;
}