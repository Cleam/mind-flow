# GitHub Copilot Instructions for mind-flow

## Project Overview

**Mind-flow** is a 4-phase RAG knowledge base assistant using NestJS 11 + Prisma 7 + PostgreSQL + pgvector.  
Currently at **Phase 2 complete**: Embedding API integration (Qwen/OpenAI/Ollama) + text chunking with overlap + LLM Provider strategy pattern.  
Additionally, the ingestion pipeline now supports multipart file upload with parsing, text cleaning, and smart chunking for `pdf/docx/md/txt` documents.  
See [PLAN.md](../PLAN.md) for full roadmap.

## Architecture & Key Decisions

### Module Structure (at `src/`)

- **AppModule**: Orchestrates all sub-modules; imports `ConfigModule`, `PrismaModule`, `VectorModule`, `IngestModule`, `LlmModule`, `EmbeddingModule`, `RerankModule`
- **PrismaModule**: Global singleton providing database client via `PrismaService`
- **VectorModule**: Handles vector embedding storage with `VectorService` (similarity search)
- **DocumentParserModule**: File parsing layer for uploaded documents (`pdf/docx/md/txt`)
- **IngestModule**: Document ingestion pipeline with `IngestController` + `IngestService` + `TextCleanerService` + `SmartChunkingService`
- **LlmModule**: Abstraction layer for LLM providers using **Strategy Pattern**
  - `LlmProvider` interface (core abstraction)
  - `BaseLlmProvider` abstract class
  - Implementations: `QwenLlmProvider`, `OpenAILlmProvider`, `OllamaLlmProvider`, `MockLlmProvider`
  - `LlmProviderFactory` (auto-selects provider via `EMBEDDING_PROVIDER` env var)
- **EmbeddingModule**: Delegates to `LlmProvider.embed()` / `batchEmbed()` for vectorization
- **RerankModule**: Delegates to `LlmProvider.rerank()` for relevance-based re-ranking

### Critical Tech Stack Choices

1. **ESM-only**: Entire codebase is ESM (`"type": "module"`). **ALL local imports must include `.js` extension**, e.g., `import { Foo } from './foo.js'`
2. **Prisma 7 with Adapter**: Uses `PrismaPg` adapter (not old datasource URL pattern). Constructor in `PrismaService`:
   ```typescript
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   super({ adapter });
   ```
3. **Vector Storage**: 1536-dimension PostgreSQL vectors via pgvector extension. Use `Unsupported("vector(1536)")` in schema.
4. **Raw SQL for Vectors**: Complex vector operations use Prisma `$executeRaw` (e.g., `saveChunk` in `VectorService`) because Prisma doesn't have first-class vector support.
5. **Strategy Pattern for LLM Providers**: All LLM capabilities (embedding, reranking, generation) abstracted via `LlmProvider` interface. Implementation automatically selected by `LlmProviderFactory` based on `EMBEDDING_PROVIDER` environment variable. Supports Qwen, OpenAI, Ollama, and Mock providers without code branching in service layers.
6. **File Upload Ingestion**: `POST /upload-files` uses `FilesInterceptor('files', 10)` and multer memory storage. File parsing, cleaning, and chunking are kept as separate services so `IngestService` remains an orchestration layer.

## Data Model

**DocumentChunk** table (in `prisma/schema.prisma`):

- `id` (BigInt): Auto-increment primary key
- `content` (String): Document text chunk
- `metadata` (Json): Flexible metadata. Current ingestion flow writes at least `source` and `chunkIndex`, and file/JSON upload paths also include `documentIndex`
- `embedding` (vector(1536)): PostgreSQL vector type (always 1536 dimensions)
- `createdAt` (DateTime): Auto-timestamped

**ChatMessage** table (Phase 4 preparation, schema ready for use):

- `id` (BigInt): Auto-increment primary key
- `sessionId` (String): Session identifier for multi-turn conversations
- `role` (Enum: 'user' | 'assistant'): Message sender role
- `content` (String): Message text
- `embedding` (vector(1536), nullable): Optional embedding for semantic search
- `createdAt` (DateTime): Timestamp
- Index: `(sessionId, createdAt)` for efficient history retrieval

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

For multipart file upload options, use numeric form fields transformed via `class-transformer`, and validate `chunkOverlap < chunkSize` with a custom validator.

- **DTO 参数注释要求**：DTO 中每个对外字段（请求参数与响应字段）都应添加简短中文注释，优先说明业务语义、取值范围与默认值（如有）。

### Type Checking & ESLint Balance

1. **Always run type check and lint after code changes**: `pnpm -s tsc --noEmit -p tsconfig.json` and `pnpm lint` (or file-scoped `pnpm eslint <file>` during iteration).
2. **Prefer Prisma generated types directly** (`ChatRole`, model fields, Prisma args) and avoid introducing extra delegate/wrapper interfaces only to satisfy lint rules.
3. **Balance strictness and readability**:
  - Keep `@typescript-eslint/no-unsafe-*` as **warning** level globally.
  - For known tooling boundaries (Prisma generated client, external SDK unknown responses), allow **small local `eslint-disable-next-line`** with a short reason comment.
  - Do not spread `eslint-disable` across large code blocks; keep it at the narrowest call boundary.
4. **Do not trade maintainability for zero warnings**: business service code should remain straightforward and easy to understand.

### Code Commenting (中文注释规范)

1. **Use Simplified Chinese comments by default** for newly generated code in this repository.
2. **Add necessary comments for logic understanding**, especially for:
  - Non-trivial control flow (fallback, retry, degrade path)
  - Boundary handling (validation, defaults, truncation, pagination)
  - Infrastructure boundaries (Prisma raw SQL, external SDK response mapping, streaming)
  - Why a workaround is needed (e.g., local lint disable at tooling boundary)
  - Data-flow transformation points (DTO mapping, prompt assembly, ranking/threshold filtering)
3. **Comment quality requirements**:
  - Explain “why/intent”, not obvious “what”.
  - Keep comments concise and close to the related code block.
  - Avoid redundant line-by-line narration and avoid stale TODO-style comments.
  - For methods with multiple stages, include short stage comments near key branches/loops (not only method header comments).
4. **Function-level guidance**:
  - For key service methods, add a short Chinese doc comment describing input, output, and side effects when not self-evident.
5. **Readability first**:
  - Do not introduce complex wrapper types only to silence lint.
  - Prefer small local comments + minimal lint suppression over large structural complexity.
6. **Comment coverage recommendation**:
  - Public methods in core modules (`chat`, `ingest`, `vector`, `embedding`, `rerank`) should include a short Chinese doc comment by default.
  - When changing existing complex logic, add or update comments together with the code change.
7. **Detailed-comment baseline**:
  - In core workflow methods, ensure at least one explanatory comment for each critical step (e.g., input normalization, external call, fallback decision, output shaping).
  - For streaming or async pipeline code, comment cancellation/cleanup behavior explicitly.

### File Ingestion Pipeline

Current file ingestion path:

1. `IngestController.uploadFiles()` validates file count, MIME, and size.
2. `DocumentParserService.parseMany()` extracts text from uploaded files.
3. `TextCleanerService.clean()` normalizes raw text and removes common parser artifacts.
4. `SmartChunkingService.split()` performs paragraph-first chunking with sentence fallback and character sliding-window fallback.
5. `IngestService.processFiles()` calls `EmbeddingService.embed()` and `VectorService.saveChunk()` for each chunk.

Supported file formats in the current codebase:

- `pdf` via `pdf-parse`
- `docx` via `mammoth`
- `md` and `txt` via UTF-8 text decoding

Upload constraints in the current controller:

- Max 10 files per request
- Max 20MB per file
- Allowed MIME values: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown`, `text/x-markdown`

### Vector Operations

1. **Embedding Dimension Validation**: Always validate embedding dimension (must be 1536) before storage; use `EmbeddingService` for vectorization, never call LLM provider directly
2. **SQL Injection Safety**: Use template literals with Prisma `$executeRaw` for raw SQL:
   ```typescript
   await this.prisma.$executeRaw`
     INSERT INTO "DocumentChunk" ("content", "metadata", "embedding")
     VALUES (${content}, ${JSON.stringify(metadata)}::jsonb, ${vectorMarkup}::vector)
   `;
   ```
3. **Metadata Structure**: Always include `source` and `chunkIndex` fields; metadata is auto-serialized as JSON in Prisma:
   ```typescript
  const metadata = { source: 'doc1.pdf', documentIndex: 0, chunkIndex: 0 };
   ```
4. **Similarity Search**: Use pgvector's `<=>` cosine distance operator with `$queryRaw`; always include `threshold` filtering and `limit` pagination
5. **Provider-Agnostic Code**: Use injected `EmbeddingService` or `RerankService` in service layers, never call LLM provider directly — allows transparent provider switching

### Constants

- Vector dimension: `1536` (used in `EmbeddingService`, `VectorService`, `IngestService`; keep synchronized across all modules)
- Metadata required fields: `source`, `chunkIndex` (file and JSON upload paths also write `documentIndex`)
- Default JSON upload chunk size: `500` characters
- Default JSON upload chunk overlap: `100` characters
- Default file upload chunk size: `400` characters
- Default file upload chunk overlap: `80` characters
- Default similarity threshold: `0.5`
- Default top-K limit: `3` (for RAG context retrieval)

## File Locations Reference

| Path                    | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `prisma/schema.prisma`  | Data model definitions                          |
| `prisma/migrations/`    | Database migration history                      |
| `src/generated/prisma/` | Auto-generated Prisma client (ESM)              |
| `src/document-parser/`  | File parsing module and parser tests            |
| `src/ingest/text-cleaner.service.ts` | Parsed text normalization          |
| `src/ingest/smart-chunking.service.ts` | Paragraph-first chunking strategy |
| `docker-compose.yml`    | Local PostgreSQL + pgvector setup               |
| `.env`                  | Local environment variables (excluded from git) |
| `jest.config.mjs`       | Unit test configuration                         |
| `test/jest-e2e.mjs`     | e2e test configuration                          |
| `PLAN.md`               | 4-phase development roadmap                     |
| `LOCAL_SETUP.md`        | Local development guide                         |

## Upcoming Work (Phases 3-4)

**Phase 3: RAG Retrieval & Single-Turn Q&A (阶段 3：RAG 检索与单轮问答)**
- Vector similarity search with `querySimilar(embedding, limit, threshold)` using pgvector `<=>` operator
- Prompt engineering via `PromptService.buildRagPrompt(query, context)` with strict context-grounding
- Chat pipeline: vectorize query → retrieve top-K chunks → rerank → build prompt → LLM generation
- `POST /chat/ask` endpoint returning `{answer, sources}` with citation metadata
- Full test coverage for retrieval accuracy and citation correctness

**Phase 4: Multi-Turn Memory & Streaming (阶段 4：多轮记忆与流式输出)**
- `ChatSession` + `ChatMessage` tables for conversation persistence
- `ConversationService` for history retrieval and message storage
- Query rewriting via `QueryRewriteService.rewriteQuery(query, history)` to handle pronouns and context
- SSE streaming via `@Sse` endpoint: `POST /chat/stream` with token-by-token LLM output
- Session-scoped history (3-round window for context rewriting, full history for retrieval)

When implementing new phases:

- **Maintain constant vector dimension (1536)** across all modules
- **Use existing service abstractions**: `EmbeddingService`, `RerankService` (never call LLM provider directly)
- **Follow DI patterns**: Inject `PrismaService`, `EmbeddingService`, `VectorService`, parser/cleaner/chunking services in constructors as needed
- **ESM compliance**: All local imports must include `.js` extension
- **Update `PLAN.md` progress** as milestones complete
- **Single responsibility**: Each service has one reason to change (separation of concerns)
- **Provider transparency**: Code should work identically with any LLM provider (Qwen, OpenAI, Ollama)
- **Preserve dual ingestion modes**: keep `/upload` for JSON text ingestion and `/upload-files` for multipart file ingestion unless the task explicitly changes the API contract
- **File upload failures should be partial-tolerant**: a single file parse failure must not abort the whole batch if other files remain processable

## Quick Checklist for New Features

- [ ] Service has `@Injectable()` decorator
- [ ] Local imports include `.js` extension (e.g., `./foo.js` not `./foo`)
- [ ] DTOs use class-validator decorators (`@IsString`, `@IsNumber`, etc.)
- [ ] DTO public fields include concise Chinese parameter comments (meaning/range/default)
- [ ] Multipart numeric fields use `@Type(() => Number)` when coming from form-data
- [ ] Raw SQL uses Prisma template literals (not string interpolation)
- [ ] Metadata always includes: `source`, `chunkIndex` (and `documentIndex` when relevant)
- [ ] Vector dimension validated before storage (must be 1536)
- [ ] Services use dependency injection, never call providers directly
- [ ] Error handling includes specific error messages (e.g., "Embedding failed", "No relevant context")
- [ ] File upload endpoints enforce MIME and size limits in controller or pipe
- [ ] Parser, cleaner, and chunking changes are covered by unit tests
- [ ] Prisma client generated: `pnpm prisma:generate`
- [ ] Migration created if model changed: `pnpm prisma:migrate:dev`
- [ ] Build succeeds: `pnpm build`
- [ ] Linting passes: `pnpm lint`
- [ ] Unit tests pass: `pnpm test`
- [ ] E2E tests pass: `pnpm test:e2e`
- [ ] Database reachable: `docker-compose ps`
- [ ] `.env` configured with required LLM provider credentials (Qwen/OpenAI/Ollama)
