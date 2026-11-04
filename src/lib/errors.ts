// Expected, user-facing failures. Never retried, and safe to show to the owner.
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Item") {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}
