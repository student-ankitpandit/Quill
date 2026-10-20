export declare global {
    namespace Express {
        interface Request {
            installationId: string
            userId: string
            login?: string
            name?: string
            email?: string
        }
    }
}
