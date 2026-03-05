# 开发计划

目标：打造一个AI知识库助手
后端技术：NestJs + Prisma + PostgreSQL + pgvector
前端技术：vue3或react

## 将项目拆解为 **4 个里程碑阶段**

---

### 🚀 阶段 1：基础设施与“骨架”跑通

**目标**：配置数据库，实现最简单的向量存取，不考虑 RAG，先能把一段话变成向量存进 PG。

```
> **角色**：NestJS + Prisma + PostgreSQL 专家
> **任务**：请帮我初始化 NestJS 项目的基础架构。
>
> 1. **数据库配置**：在 `schema.prisma` 中定义 `DocumentChunk` 模型，包含 `id`, `content`, `metadata (Json)`，以及使用 `Unsupported("vector(1536)")` 定义的 `embedding` 字段。
> 2. **插件支持**：编写一个 Prisma Migration 脚本或说明，确保 PostgreSQL 开启了 `pgvector` 扩展。
> 3. **核心 Service**：创建一个 `VectorService`，包含一个 `saveChunk` 方法，使用 `$executeRaw` 将 `number[]` 类型的向量存入 `embedding` 字段。
> 4. **验证接口**：创建一个 `POST /test-ingest` 接口，接收一个字符串数组，调用一个模拟的 Embedding 函数（先用随机数代替），并存入数据库。
>    **要求**：代码要符合 NestJS 模块化规范，注释清晰。
```

---

### 🧠 阶段 2：集成 Embedding 与文档切片（入库链路）

**目标**：接入真实的 Embedding API（如 OpenAI），实现带 Overlap 的切片逻辑。

```
> **角色**：AI 工程师
> **任务**：完善文档入库（Ingestion）逻辑。
>
> 1. **切片逻辑**：在 `IngestionService` 中实现一个 `splitText` 方法。参数包含 `chunkSize` (500) 和 `chunkOverlap` (100)。要求逻辑健壮，能处理短文本。
> 2. **模型对接**：创建一个 `EmbeddingService`，接入 OpenAI 的 `text-embedding-3-small` 接口（使用 `axios` 或官方 SDK）。
> 3. **流水线串联**：在 `processDocument` 方法中，将“切片 -> 获取向量 -> 批量存入 Prisma”的流程串联起来。
> 4. **验证逻辑**：提供一个 `POST /upload` 接口，我上传一段长文本，你返回切片的数量和存入成功的状态。
```

---

### 🔍 阶段 3：实现 RAG 检索与单轮问答（检索链路）

**目标**：实现向量搜索，拼接 Prompt，让 LLM 根据本地知识库回答。

```
> **角色**：RAG 架构师
> **任务**：实现核心 RAG 检索问答逻辑。
>
> 1. **向量查询**：在 `VectorService` 中使用 `$queryRaw` 实现余弦相似度查询（使用 `<=>` 操作符），支持 `limit` 和 `threshold` 过滤。
> 2. **Prompt 引擎**：编写一个 `PromptService`，采用“方案 B”：要求 LLM 严格根据【参考资料】回答，若无匹配则回答不知道。
> 3. **对话逻辑**：实现 `ChatController`。流程：用户提问 -> 向量化提问 -> 检索 Top-3 片段 -> 拼接 Prompt -> 调用 LLM 生成答案。
> 4. **验证逻辑**：我通过 Postman 提问，你应该返回 AI 的回答以及它参考的 `metadata` 来源。
```

---

### 💬 阶段 4：进阶体验（多轮记忆与流式输出）

**目标**：增加 `ChatMessage` 表，实现问题改写逻辑和 SSE 流式响应。

```
> **角色**：高级后端工程师
> **任务**：为系统增加“记忆”和“流式输出”。
>
> 1. **记忆存储**：在 Prisma 中增加 `ChatMessage` 表，记录 `sessionId`, `role`, `content`。
> 2. **问题改写**：在检索前，增加一个步骤：调用 LLM 结合最近 3 轮历史记录，将当前问题改写为独立的搜索词。
> 3. **流式输出 (SSE)**：将 `ChatController` 的响应改为 `@Sse`。使用 `AsyncIterable` 处理 LLM 的流式返回，并封装成 `MessageEvent` 发送给客户端。
> 4. **验证逻辑**：提供一个支持 `sessionId` 的流式接口，验证 AI 是否能记住我上一句话提到的背景。
```

---
