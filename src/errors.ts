export class IRacingAPIError extends Error {
    constructor(
        message: string,
        public status: number,
        public statusText: string,
        public body?: any
    ) {
        super(message);
        this.name = 'IRacingAPIError';
    }
}
