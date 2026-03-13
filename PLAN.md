# 开发计划

目标：实现一个AI知识库助手的API服务
技术栈：NestJs + Prisma + PostgreSQL + pgvector

## 将项目拆解为 **4 个里程碑阶段**

---

### 🚀 阶段 1：基础设施与“骨架”跑通

**目标**：配置数据库，实现最简单的向量存取，不考虑 RAG，先能把一段话变成向量存进 PG。

```md
> **角色**：NestJS + Prisma + PostgreSQL 专家
> **任务**：初始化可运行的向量存储基础架构（Phase 1 基线），为后续 Ingestion/RAG 做准备。
>
> 1. **数据模型**：在 `schema.prisma` 定义 `DocumentChunk`，字段包含 `id`、`content`、`metadata(Json)`、`embedding(Unsupported("vector(1536)"))`、`createdAt`。
> 2. **数据库能力**：通过 migration 启用 `pgvector` 扩展，并保证本地 `docker-compose` 环境可一键启动 PostgreSQL。
> 3. **Prisma 集成**：实现 `PrismaModule/PrismaService`（全局单例），采用当前项目的 Prisma Adapter 方式连接数据库。
> 4. **向量存储服务**：实现 `VectorService.saveChunk(content, metadata, embedding)`，使用 Prisma `$executeRaw` 写入向量；入参必须校验 embedding 维度为 1536。
> 5. **验证接口**：实现 `POST /test-ingest`，接收字符串数组，使用可复现的 mock embedding 生成策略完成入库，返回 `insertedCount`。
> 6. **工程约束**：遵循 NestJS 模块化；项目为 ESM，所有本地 import 必须带 `.js` 后缀；避免硬编码业务常量分散。
> 7. **验收标准**：`pnpm build`、`pnpm test`、`pnpm test:e2e` 通过；调用 `/test-ingest` 后数据库可查询到对应 `DocumentChunk` 记录。
```

---

### 🧠 阶段 2：集成 Embedding 与文档切片（入库链路）

**目标**：接入真实的 Embedding API（如 Qwen），实现带 Overlap 的切片逻辑。

```md
> **角色**：AI 工程师
> **任务**：基于当前策略模式架构，完善文档入库（Ingestion）与重排（Rerank）能力。
>
> 1. **策略接口约束**：所有 LLM 能力通过 `LlmProvider` 暴露（`embed` / `batchEmbed` / `rerank`），由 `LlmProviderFactory` 按 `EMBEDDING_PROVIDER` 自动选择 `qwen/openai/ollama/mock`。
> 2. **Embedding 对接**：优先支持 Qwen（默认模型 `text-embedding-v4`），同时保持 OpenAI/Ollama 可切换；`EmbeddingService` 仅做委托层，不写 provider 分支逻辑。
> 3. **切片与入库流水线**：在 `IngestService.processDocuments` 串联“`splitText(chunkSize=500, chunkOverlap=100)` -> embedding -> `VectorService.saveChunk`”，要求支持短文本、空白过滤、失败分片不中断整体流程。
> 4. **Rerank 能力**：新增 `RerankService` + `POST /rerank`，输入 `query + documents + topK`，返回按相关性降序的结果（含 `index/score/document`）。
> 5. **接口与兼容性**：保留 `POST /test-ingest` 与 `POST /upload` 行为不变；新增能力不得破坏现有 e2e 用例。
> 6. **验收标准**：`pnpm lint`、`pnpm build`、`pnpm test`、`pnpm test:e2e` 全通过；补齐 `.env.example` 里 Qwen/OpenAI/Ollama 的 embedding/rerank 配置项说明。
```

**当前进度（2026-03-09）**：✅ 已完成首版实现（`/upload`、`splitText`、`EmbeddingService` 可切换 provider）

**架构重构（2026-03-10）**：✅ 采用策略模式重构 LLM Provider

- **核心架构**：使用策略模式 (`LlmProvider` 接口 + `BaseLlmProvider` 抽象类) 统一管理 Embedding 和 Rerank 功能
- **Provider 实现**：
  - `QwenLlmProvider`：阿里云百炼 (兼容 OpenAI 协议)
  - `OpenAILlmProvider`：OpenAI 官方 API
  - `OllamaLlmProvider`：本地 Ollama 模型
  - `MockLlmProvider`：测试/无 API 场景
- **工厂模式**：`LlmProviderFactory` 根据 `EMBEDDING_PROVIDER` 环境变量自动实例化
- **服务层**：
  - `EmbeddingService`：委托给 `LlmProvider.embed()` / `batchEmbed()`
  - `RerankService`：委托给 `LlmProvider.rerank()`，支持 `topK` 截断
- **API 端点**：新增 `POST /rerank` 接口 (`RerankController`)
- **向后兼容**：现有 `/upload` 接口无需改动，透明切换

**文件结构**：

```text
src/
  llm/
    providers/
      base/
        llm-provider.interface.ts    # 核心接口定义
        base-llm-provider.ts         # 抽象基类
      qwen/qwen-llm-provider.ts
      openai/openai-llm-provider.ts
      ollama/ollama-llm-provider.ts
      mock/mock-llm-provider.ts
    llm-provider.factory.ts          # Provider 工厂
    index.ts                         # 统一导出
  embedding/
    embedding.service.ts             # → 简化为委托层
    embedding.module.ts
  rerank/
    rerank.service.ts                # 新增
    rerank.controller.ts             # 新增
    rerank.module.ts
    dto/
      rerank-request.dto.ts
      rerank-result.dto.ts
```

---

#### 26-03-11新增接口

新增一个接受文件的接口：

- 解析文件内容
- 文档内容清洗 -> 切片 -> 入向量库
- 切片考虑最佳实践以便提升检索的准确度

### 🔍 阶段 3：实现 RAG 检索与单轮问答（检索链路）✅ 已完成（2026-03-13）

**目标**：实现向量搜索，拼接 Prompt，让 LLM 根据本地知识库回答。

```md
> **角色**：RAG 架构师
> **任务**：实现核心 RAG 检索问答逻辑，从用户查询到知识库检索再到 LLM 回答的完整链路。
>
> 1. **向量检索能力**：在 `VectorService.search(embedding, limit, threshold)` 中使用 `Prisma.$queryRaw` 配合 pgvector `<=>` 运算符实现余弦相似度查询；返回 Top-K 片段及相关性分数。
> 2. **Prompt 引擎**：实现 `PromptService.generatePrompt(query, retrievedChunks)` 方法，采用严格约束模板："你必须只根据以下【参考资料】回答问题，若资料中无相关信息则回答'不了解'"；返回拼接后的完整 prompt。
> 3. **问答编排**：实现 `ChatService` 编排"向量化查询 -> 检索 Top-3 chunks -> 重排排序 -> 生成 Prompt -> 调用 LLM"的完整流程；异常单点不应中断整体流程。
> 4. **问答接口**：实现 `ChatController.ask(question)` 接收自然语言查询，返回 `{ answer: string, citations: Array<{chunkId, source, score}> }` 结构。
> 5. **工程约束**：使用注入的 `EmbeddingService`、`VectorService`、`RerankService` 无直接耦合；Prompt 模板统一管理避免硬编码；支持切换不同 LLM Provider。n> 6. **验收标准**：`pnpm build`、`pnpm test`、`pnpm test:e2e` 通过；通过 curl 提问得到含 `answer` 和 `citations` 的完整响应；向量检索能过滤出相关片段。
```

**当前进度（2026-03-13）**：✅ 全部完成

- **LLM 生成能力**：`LlmProvider` 接口新增 `generate(prompt)` 方法；Qwen / OpenAI / Ollama / Mock 四个 Provider 均已实现；`LlmProviderFactory` 透传 `*_CHAT_MODEL` 环境变量
- **向量检索**：`VectorService.search(embedding, limit, threshold)` 使用 pgvector `<=>` 余弦距离，返回 `SearchChunkResult[]`（含 id / content / metadata / score）
- **Prompt 引擎**：`PromptService.generatePrompt` 严格约束模板，无内容时注入 `（无）` 触发 LLM 降级回答
- **问答编排**：`ChatService.ask` 完整链路：embed → search → tryRerank（失败降级）→ generatePrompt → generate
- **问答接口**：`POST /chat/ask`（180s 超时），返回 `{ answer, sources: [{chunkId, source, score, chunkIndex}] }`
- **无结果处理**：向量检索为空时直接返回 `answer='不了解', sources=[]`（code=0，非报错）
- **新文件**：`src/chat/`（`chat.module.ts` / `chat.service.ts` / `chat.controller.ts` / `prompt.service.ts` / `dto/*.ts`）
- **测试覆盖**：`chat.service.spec.ts`、`prompt.service.spec.ts`、`vector.service.spec.ts`、`test/chat.e2e-spec.ts`
- **验收结果**：`pnpm build` ✅ / `pnpm test` ✅ / `pnpm test:e2e` ✅ / `pnpm lint` ✅（0 errors）

---

### 💬 阶段 4：进阶体验（多轮记忆与流式输出）

**目标**：增加 `ChatMessage` 表，实现问题改写逻辑和 SSE 流式响应。

```md
> **角色**：高级后端工程师
> **任务**：为 RAG 系统增加"对话记忆"与"流式体验"，支持多轮连贯对话。
>
> 1. **对话历史存储**：在 `schema.prisma` 新增 `ChatMessage` 模型，字段包括 `id`、`sessionId`、`role`（'user'|'assistant'）、`content`、`createdAt`；建立 `(sessionId, createdAt)` 复合索引支持快速查询。
> 2. **会话管理**：实现 `ChatService.getHistory(sessionId, limit=10)` 获取当前会话历史；实现 `ChatService.saveMessage(sessionId, role, content)` 持久化对话。
> 3. **问题增强与重写**：实现 `QueryRewriteService.rewrite(currentQuestion, history)` 方法，调用 LLM 将当前问题结合最近 3 轮对话上下文改写为独立的搜索查询词，避免"代词歧义"；返回改写后的查询。
> 4. **流式输出 (SSE)**：改造 `ChatController.askWithHistory(sessionId, question)` 为 `@Sse` 端点，令其返回 `Observable<MessageEvent>`；分别流式发送"检索开始 -> 检索完成 -> LLM 生成中 -> 完全回答" 等消息事件。
> 5. **工程约束**：流式 LLM 调用需支持中断与超时；历史记录分页避免单次加载过大；确保并发多 session 不互相污染。
> 6. **验收标准**：`pnpm build`、`pnpm test`、`pnpm test:e2e` 通过；通过 `curl --no-buffer` 订阅 SSE 端点验证流式事件；不同 sessionId 历史记录相互隔离；3 轮对话后 LLM 能应用上下文改写问题。
```

---
