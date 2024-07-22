export class AsyncLazy<T> {
  private promise?: Promise<T>;
  private value?: T;
  private err?: unknown;
  private promiseFulfilled = false;

  constructor(private readonly func: () => Promise<T>) {}

  async run(): Promise<T> {
    if (!this.promise) {
      this.promise = this.func().then(
        (value) => {
          this.value = value;
          this.promiseFulfilled = true;
          return value;
        },
        (err) => {
          this.err = err;
          this.promiseFulfilled = true;
          throw err;
        },
      );
    }
    return this.promise;
  }

  get isRunning() {
    return this.promise && !this.didRun;
  }

  get didRun() {
    return this.promiseFulfilled;
  }

  get result() {
    if (this.didRun) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      if (this.err) throw this.err;
      return this.value!;
    }
    if (this.isRunning) throw new Error("Lazy evaluation is still running");
    throw new Error("Lazy evaluation did not start yet");
  }

  get error() {
    if (this.didRun) return this.err;
    if (this.isRunning) throw new Error("Lazy evaluation is still running");
    throw new Error("Lazy evaluation did not start yet");
  }
}
