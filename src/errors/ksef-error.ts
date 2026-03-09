export class KSeFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KSeFError';
  }
}
