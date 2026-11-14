export interface PgQueryResult {
  readonly rows: readonly unknown[];
  readonly rowCount: number | null;
}

/** The subset of node-postgres' Pool/Client query API used by this adapter. */
export interface PgQueryable {
  query(queryText: string, values?: unknown[]): Promise<PgQueryResult>;
}

/** A checked-out node-postgres client. */
export interface PgTransactionClient extends PgQueryable {
  release(): void;
}

/** The subset of node-postgres' Pool API required for transactional commands. */
export interface PgTransactionPool extends PgQueryable {
  connect(): Promise<PgTransactionClient>;
}
