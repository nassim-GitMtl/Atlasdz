# Local infrastructure

This composition is for synthetic LOCAL development only. It is not a production topology
and makes no claim about Algerian hosting, data residency, high availability, security
certification, backup, or disaster recovery.

Pinned local dependencies:

- PostgreSQL 17.11
- Redis 8.10.2
- OpenSearch 3.8.0 with its security plugin disabled only on loopback-bound LOCAL ports
- RabbitMQ 4.3.6 with the management UI
- Adobe S3Mock 5.2.2 as the S3-compatible LOCAL/TEST adapter

S3Mock is deliberately a test double and is prohibited outside LOCAL/TEST. The production
object-storage provider remains an external platform, legal, privacy, and security decision.

## Start

```bash
cp .env.example .env.local
pnpm infra:up
pnpm infra:status
pnpm db:migrate
pnpm db:verify
pnpm db:seed:synthetic
```

## Stop

```bash
pnpm infra:down
```

Volumes are retained by default. Deliberately deleting local volumes is a separate manual
operation because it destroys local data; it is not part of `infra:down`.
