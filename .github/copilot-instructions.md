# GitHub Copilot Instructions for mind-flow

## Project Overview

**Mind-flow** is a 4-phase RAG knowledge base assistant using NestJS 11 + Prisma 7 + PostgreSQL + pgvector.  
Currently at **Phase 1 complete**: Basic infrastructure with vector embeddings storage.  
See [PLAN.md](../PLAN.md) for full roadmap.

## Architecture & Key Decisions

### Module Structure (at `src/`)

- **AppModule**: Orchestrates all sub-modules; imports `ConfigModule`, `PrismaModule`, `VectorModule`, `IngestModule`
- **PrismaModule**: Global singleton providing database client via `PrismaService`
- **VectorModule**: Handles vector embedding storage with `VectorService`
- **IngestModule**: Document ingestion pipeline with `IngestController` + `IngestService`

### Critical Tech Stack Choices

1. **ESM-only**: Entire codebase is ESM (`"type": "module"`). **ALL local imports must include `.js` extension**, e.g., `import { Foo } from './foo.js'`
2. **Prisma 7 with Adapter**: Uses `PrismaPg` adapter (not old datasource URL pattern). Constructor in `PrismaService`:
   ```typescript
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   super({ adapter });
   ```
3. **Vector Storage**: 1536-dimension PostgreSQL vectors via pgvector extension. Use `Unsupported("vector(1536)")` in schema.
4. **Raw SQL for Vectors**: Complex vector operations use Prisma `$executeRaw` (e.g., `saveChunk` in `VectorService`) because Prisma doesn't have first-class vector support.

## Data Model

**DocumentChunk** table (in `prisma/schema.prisma`):

- `id` (BigInt): Auto-increment primary key
- `content` (String): Document text chunk
- `metadata` (Json): Flexible metadata (`{source, chunkIndex, ...}`)
- `embedding` (vector(1536)): PostgreSQL vector type
- `createdAt` (DateTime): Auto-timestamped

## Development Workflows

### Build & Compilation

```bash
pnpm build           # Compiles TS → ESM JS; output goes to dist/src/ (not dist/)
pnpm start:dev       # NestJS watch mode
pnpm start:prod      # node dist/src/main.js
```

### Database Operations

```bash
pnpm prisma:generate          # Regenerate Prisma client (to src/generated/prisma/)
pnpm prisma:migrate:dev       # Create & apply migration interactively
pnpm prisma:migrate:deploy    # Apply migrations in production
docker-compose up -d          # Start local PostgreSQL + pgvector
docker-compose down -v        # Teardown with volume cleanup
```

### Testing

```bash
pnpm test             # ESM-aware Jest (uses NODE_OPTIONS="--experimental-vm-modules")
pnpm test:e2e         # e2e tests with separate jest.config.mjs
pnpm test:watch       # Watch mode
```

### Environment Setup

- **Local DB**: Use `docker-compose.yml` (pgvector/pgvector:pg16)
- **Env vars**: `.env` file; must include `DATABASE_URL` (e.g., `postgresql://postgres:postgres@localhost:5432/mind_flow?schema=public`)
- First-time setup: See [LOCAL_SETUP.md](../LOCAL_SETUP.md)

## Code Patterns & Conventions

### NestJS Service Injection

Use constructor-based DI; services are decorated with `@Injectable()`:

```typescript
@Injectable()
export class MyService {
  constructor(private readonly prisma: PrismaService) {}
}
```

### DTOs & Validation

Use class-validator for input validation (e.g., `TestIngestDto` in `src/ingest/dto/`):

```typescript
import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class TestIngestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  texts!: string[];
}
```

### Vector Operations

1. Always validate embedding dimension (must be 1536) before storage
2. Use template literals with Prisma `$executeRaw` for SQL injection safety:
   ```typescript
   await this.prisma.$executeRaw`
     INSERT INTO "DocumentChunk" ("content", "metadata", "embedding")
     VALUES (${content}, ${JSON.stringify(metadata)}::jsonb, ${vectorMarkup}::vector)
   `;
   ```
3. Metadata should be a plain object (auto-serialized as JSON in Prisma)

### Constants

- Vector dimension: `1536` (used in `VectorService`, `IngestService`; keep synchronized)
- Metadata required fields: `source`, `chunkIndex` (expandable as needed)

## File Locations Reference

| Path                    | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `prisma/schema.prisma`  | Data model definitions                          |
| `prisma/migrations/`    | Database migration history                      |
| `src/generated/prisma/` | Auto-generated Prisma client (ESM)              |
| `docker-compose.yml`    | Local PostgreSQL + pgvector setup               |
| `.env`                  | Local environment variables (excluded from git) |
| `jest.config.mjs`       | Unit test configuration                         |
| `test/jest-e2e.mjs`     | e2e test configuration                          |
| `PLAN.md`               | 4-phase development roadmap                     |
| `LOCAL_SETUP.md`        | Local development guide                         |

## Upcoming Work (Phases 2-4)

Phase 2: Integrate real Embedding API (OpenAI `text-embedding-3-small`) + text chunking with overlap  
Phase 3: Vector similarity search (`<=>` operator) + RAG prompt engine + ChatController  
Phase 4: Multi-turn memory (`ChatMessage` table) + SSE streaming responses

When implementing new phases:

- Maintain constant vector dimension (1536)
- Use existing `VectorService.saveChunk()` for bulk ingestion
- Follow DI patterns; inject `PrismaService` directly (not via modules)
- Update `PLAN.md` progress as milestones complete

## Quick Checklist for New Features

- [ ] Service has `@Injectable()` decorator
- [ ] Local imports include `.js` extension
- [ ] DTOs use class-validator decorators
- [ ] Raw SQL uses Prisma template literals (not string interpolation)
- [ ] Prisma client generated: `pnpm prisma:generate`
- [ ] Migration created if model changed: `pnpm prisma:migrate:dev`
- [ ] Tests run: `pnpm test`
- [ ] Metadata structure consistent (document in `*.service.ts`)
- [ ] Vector dimension validated before storage
- [ ] Database reachable via `docker-compose ps`
