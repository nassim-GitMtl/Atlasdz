import type {
  PgQueryResult,
  PgQueryable,
  PgTransactionClient,
  PgTransactionPool,
} from '../src/postgres-types.js';

export interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[];
}

type QueryStep = Readonly<{ rows: readonly unknown[] }> | Readonly<{ error: Error }>;

const result = (rows: readonly unknown[]): PgQueryResult => ({ rows, rowCount: rows.length });

export class ScriptedQueryable implements PgQueryable {
  public readonly calls: QueryCall[] = [];

  public constructor(private readonly steps: QueryStep[]) {}

  public async query(queryText: string, values: unknown[] = []): Promise<PgQueryResult> {
    this.calls.push(Object.freeze({ text: queryText, values: Object.freeze([...values]) }));
    const step = this.steps.shift();
    if (step === undefined) {
      throw new Error('Unexpected query');
    }
    if ('error' in step) {
      throw step.error;
    }
    return result(step.rows);
  }

  public remainingSteps(): number {
    return this.steps.length;
  }
}

export class ScriptedTransactionClient extends ScriptedQueryable implements PgTransactionClient {
  public released = false;

  public release(): void {
    this.released = true;
  }
}

export class ScriptedPool implements PgTransactionPool {
  public readonly direct: ScriptedQueryable;
  public connectCount = 0;

  public constructor(
    directSteps: QueryStep[],
    public readonly client: ScriptedTransactionClient,
  ) {
    this.direct = new ScriptedQueryable(directSteps);
  }

  public query(queryText: string, values?: unknown[]): Promise<PgQueryResult> {
    return this.direct.query(queryText, values);
  }

  public async connect(): Promise<PgTransactionClient> {
    this.connectCount += 1;
    return this.client;
  }
}

export const queryRows = (rows: readonly unknown[]): QueryStep => ({ rows });
export const queryError = (error: Error): QueryStep => ({ error });
