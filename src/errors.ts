export class IRacingAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'IRacingAPIError';
  }
}
