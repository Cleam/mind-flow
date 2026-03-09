# mind-flow

知识如流 - AI知识库助手

## 阶段 1 已实现能力

- `DocumentChunk` 数据模型：`id`、`content`、`metadata(Json)`、`embedding(vector(1536))`
- Prisma migration 自动启用 `pgvector` 扩展
- `VectorService.saveChunk` 使用 `prisma.$executeRaw` 写入向量
- `POST /test-ingest`：接收字符串数组，使用随机向量模拟 embedding 后入库

## 阶段 2 已实现能力（入库链路）

### 策略模式架构（2026-03-10 架构重构）

采用**策略模式 (Strategy Pattern)** 统一管理 LLM Provider，封装 Embedding 和 Rerank 两个核心功能：

- **核心接口**：`LlmProvider` 定义 `embed()` / `batchEmbed()` / `rerank()` / `isAvailable()` 方法
- **Provider 实现**：
  - `QwenLlmProvider`：阿里云百炼 (兼容 OpenAI 协议)
  - `OpenAILlmProvider`：OpenAI 官方 API
  - `OllamaLlmProvider`：本地 Ollama 模型支持
  - `MockLlmProvider`：测试环境无需 API Key
- **工厂模式**：`LlmProviderFactory` 根据 `EMBEDDING_PROVIDER` 环境变量自动实例化相应 Provider
- **服务层**：
  - `EmbeddingService`：委托给当前 Provider 的 `embed()` / `batchEmbed()`
  - `RerankService`：委托给当前 Provider 的 `rerank()`

### 接口能力

- `POST /test-ingest`：接收字符串数组，使用 Mock 向量入库（兼容阶段 1）
- `POST /upload`：多文档批量上传，支持切片 + Embedding + 向量存储
- `POST /rerank`：语义重排序，根据查询对文档列表进行相关性排序

## 本地启动

1. 复制环境变量

```bash
cp .env.example .env
```

2. 确保 PostgreSQL 可用，并创建数据库（示例库名：`mind_flow`）

3. 执行迁移并生成 Prisma Client

```bash
pnpm prisma:migrate:dev
pnpm prisma:generate
```

4. 启动服务

```bash
pnpm start:dev
```

## 接口示例

### POST /test-ingest

请求体：

```json
{
  "texts": ["第一段文本", "第二段文本"]
}
```

响应体：

```json
{
  "insertedCount": 2
}

### POST /upload

请求体：

```json
{
  "documents": [
    {
      "content": "这是一段较长文本，用于演示文档切片和入库。",
      "source": "manual-upload"
    },
    {
      "content": "第二份文档内容。"
    }
  ],
  "chunkSize": 500,
  "chunkOverlap": 100
}
```

响应体（示例）：

```json
{
  "documentCount": 2,
  "totalChunks": 3,
  "savedCount": 3,
  "failedCount": 0,
  "status": "success",
  "failures": []
}
```

### POST /rerank

请求体：

```json
{
  "query": "如何使用 NestJS？",
  "documents": [
    "NestJS 是一个用于构建高效可扩展 Node.js 服务端应用的框架。",
    "React 是一个用于构建用户界面的 JavaScript 库。",
    "PostgreSQL 是一个强大的开源对象关系数据库系统。"
  ],
  "topK": 2
}
```

响应体（示例）：

```json
{
  "query": "如何使用 NestJS？",
  "results": [
    {
      "index": 0,
      "score": 0.95,
      "document": "NestJS 是一个用于构建高效可扩展 Node.js 服务端应用的框架。"
    },
    {
      "index": 2,
      "score": 0.42,
      "document": "PostgreSQL 是一个强大的开源对象关系数据库系统。"
    }
  ]
}
```

## 本地开发

### 快速开始

```bash
# 1. 启动 PostgreSQL + pgvector
docker-compose up -d

# 2. 创建 pgvector 扩展（如需）
docker-compose exec postgres psql -U postgres -d mind_flow -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. 初始化数据库
pnpm prisma:migrate:dev

# 4. 启动开发服务
pnpm start:dev
```

更多详见 [本地开发指南](LOCAL_SETUP.md)

### 验证接口

```bash
curl -X POST http://localhost:3000/test-ingest \
  -H "Content-Type: application/json" \
  -d '{"texts": ["文本1", "文本2"]}'

curl -X POST http://localhost:3000/upload \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {"content": "文档A", "source": "demo"},
      {"content": "文档B"}
    ],
    "chunkSize": 500,
    "chunkOverlap": 100
  }'

curl -X POST http://localhost:3000/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何使用 NestJS？",
    "documents": [
      "NestJS 是一个用于构建高效可扩展 Node.js 服务端应用的框架。",
      "React 是一个用于构建用户界面的 JavaScript 库。"
    ],
    "topK": 1
  }'
```

预期响应：
```json
{"insertedCount": 2}
```
