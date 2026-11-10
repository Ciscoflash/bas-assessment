import type { FieldError } from '../money/index.js';

/** A business-rule failure the client should see. With `field`, the UI shows it against that input. */
export class DomainError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get fieldErrors(): FieldError[] | undefined {
    return this.field ? [{ field: this.field, message: this.message }] : undefined;
  }
}

export const badRequest = (message: string, field?: string) => new DomainError(400, message, field);
export const notFound = (what: string) => new DomainError(404, `${what} not found`);
export const conflict = (message: string) => new DomainError(409, message);
export const unprocessable = (message: string) => new DomainError(422, message);
