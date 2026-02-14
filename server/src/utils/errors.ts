export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Access denied') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (resource = 'Resource') =>
    new AppError(404, 'NOT_FOUND', `${resource} not found`),
  conflict: (message: string) =>
    new AppError(409, 'CONFLICT', message),
  badRequest: (message: string) =>
    new AppError(400, 'BAD_REQUEST', message),
};
