export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(resource: string, id: string): AppError {
  return new AppError(404, 'NOT_FOUND', `${resource} with ID ${id} not found`);
}

export function badRequest(message: string): AppError {
  return new AppError(400, 'BAD_REQUEST', message);
}

export function conflict(message: string): AppError {
  return new AppError(409, 'CONFLICT', message);
}

export function unauthorized(): AppError {
  return new AppError(401, 'UNAUTHORIZED', 'Invalid or missing API key');
}
