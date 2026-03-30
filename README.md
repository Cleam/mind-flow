# mind-flow

知识如流 - AI知识库助手

当前已实现三个阶段：

- **入库链路**：`POST /upload`（JSON 文本）+ `POST /upload-files`（multipart 文件，支持 `pdf/docx/md/txt`）
- **重排序**：`POST /rerank`，基于语义相关性对多段落进行重新排序
- **RAG 问答**：`POST /chat/ask`，向量检索 + 重排 + Prompt 工程 + LLM 生成，返回答案与引用来源

## 统一响应约定

所有 HTTP JSON 接口都返回统一结构：

```json
{
  "code": 0,
  "data": {},
  "msg": "success"
}
```

- 成功：`code = 0`，`data` 为真实业务数据，`msg = "success"`
- 失败：`code != 0`，`data = null`，`msg` 为错误信息
- 前端只根据 `code` 判断成功/失败，不依赖 HTTP 状态码

常见错误码：

- `10001`：参数校验失败（`VALIDATION_FAILED`）
- `10002`：请求参数错误（`BAD_REQUEST`）
- `10003`：未授权（`UNAUTHORIZED`）
- `10004`：禁止访问（`FORBIDDEN`）
- `10005`：资源不存在（`NOT_FOUND`）
- `10006`：请求超时（`REQUEST_TIME_OUT`）
- `10008`：服务器内部错误（`INTERNAL_ERROR`）

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
- `POST /upload-files`：多文件上传，支持 `pdf/docx/md/txt` 解析 + 文本清洗 + 智能切片 + Embedding + 向量存储
- `POST /rerank`：语义重排序，根据查询对文档列表进行相关性排序

### 文件上传链路（2026-03-11）

新增文件入库能力，面向真实知识库文档导入场景：

- 文件解析：`pdf` 使用 `pdf-parse`，`docx` 使用 `mammoth`，`md/txt` 按 UTF-8 文本读取
- 文本清洗：统一换行、修复常见 PDF 断词、清理空字节、压缩多余空行、去除行尾空白
- 智能切片：段落优先，超长段落按句子边界拆分，仍超长则退回字符窗口；默认 `chunkSize=400`、`chunkOverlap=80`
- 容错策略：单文件解析失败或单分片入库失败不会中断整批处理，统一体现在返回结果的 `failures` 中

### 支持格式与限制

- 支持格式：`pdf`、`docx`、`md`、`txt`
- 支持 MIME：`application/pdf`、`application/vnd.openxmlformats-officedocument.wordprocessingml.document`、`text/plain`、`text/markdown`、`text/x-markdown`
- 单文件大小上限：20MB
- 单次最多上传：10 个文件

## 阶段 3 已实现能力（RAG 检索问答）

基于阶段 2 的向量入库能力，实现了完整的 RAG 单轮问答链路：

- **向量检索**：`VectorService.search(embedding, limit, threshold)` 使用 pgvector `<=>` 余弦距离算子，返回 Top-K 相关片段及分数
- **重排精排**：可选调用 `RerankService` 对检索结果按相关性重新排序，失败时优雅降级为检索顺序
- **Prompt 引擎**：`PromptService.generatePrompt` 拼接严格约束模板，LLM 只基于参考资料回答，无相关信息时回答"不了解"
- **LLM 生成**：通过策略模式透明调用当前 Provider（Qwen / OpenAI / Ollama / Mock）的 `generate()` 方法
- **问答接口**：`POST /chat/ask`，180 秒超时，返回 `{ answer, sources }`

### 新增环境变量

每个 Provider 新增对话模型配置（已在 `.env.example` 中补充），有默认值可省略：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `QWEN_CHAT_MODEL` | `qwen-plus` | Qwen 对话生成模型 |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | OpenAI 对话生成模型 |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b-instruct` | Ollama 对话生成模型 |

## 本地启动

Prisma 迁移出现 drift/历史校验问题时，请先参考 [PRISMA_DRIFT_CHECKLIST.md](PRISMA_DRIFT_CHECKLIST.md)。

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
  "code": 0,
  "data": {
    "insertedCount": 2
  },
  "msg": "success"
}
```

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
  "code": 0,
  "data": {
    "documentCount": 2,
    "totalChunks": 3,
    "savedCount": 3,
    "failedCount": 0,
    "status": "success",
    "failures": []
  },
  "msg": "success"
}
```

### POST /upload-files

请求类型：`multipart/form-data`

表单字段：

- `files`：可重复，支持一次上传多个文件
- `chunkSize`：可选，默认 `400`
- `chunkOverlap`：可选，默认 `80`，必须小于 `chunkSize`

示例：

```bash
curl -X POST http://localhost:3300/upload-files \
  -F "files=@./samples/guide.pdf" \
  -F "files=@./samples/notes.md" \
  -F "chunkSize=400" \
  -F "chunkOverlap=80"
```

响应体（示例）：

```json
{
  "code": 0,
  "data": {
    "documentCount": 2,
    "totalChunks": 6,
    "savedCount": 6,
    "failedCount": 0,
    "status": "success",
    "failures": []
  },
  "msg": "success"
}
```

部分失败示例：

```json
{
  "code": 0,
  "data": {
    "documentCount": 2,
    "totalChunks": 4,
    "savedCount": 3,
    "failedCount": 1,
    "status": "partial",
    "failures": [
      {
        "documentIndex": 1,
        "chunkIndex": -1,
        "source": "broken.pdf",
        "reason": "PDF 解析失败: ..."
      }
    ]
  },
  "msg": "success"
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
  "code": 0,
  "data": {
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
  },
  "msg": "success"
}
```

## 本地开发
### POST /chat/ask

请求体：

```json
{
  "question": "什么是 RAG？",
  "topK": 3,
  "threshold": 0.5
}
```

- `question`：必填，自然语言问题
- `topK`：可选（1-10），检索片段数量，默认 `3`
- `threshold`：可选（0.0-1.0），相似度阈值，默认 `0.5`

响应体（示例）：

```json
{
  "code": 0,
  "data": {
    "answer": "RAG（检索增强生成）是一种将向量检索与大语言模型结合的技术...",
    "sources": [
      {
        "chunkId": "1",
        "source": "intro.pdf",
        "score": 0.87,
        "chunkIndex": 0
      }
    ]
  },
  "msg": "success"
}
```

知识库中无相关内容时：

```json
{
  "code": 0,
  "data": {
    "answer": "不了解",
    "sources": []
  },
  "msg": "success"
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
curl -X POST http://localhost:3300/test-ingest \
  -H "Content-Type: application/json" \
  -d '{"texts": ["文本1", "文本2"]}'

curl -X POST http://localhost:3300/upload \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {"content": "文档A", "source": "demo"},
      {"content": "文档B"}
    ],
    "chunkSize": 500,
    "chunkOverlap": 100
  }'

curl -X POST http://localhost:3300/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何使用 NestJS？",
    "documents": [
      "NestJS 是一个用于构建高效可扩展 Node.js 服务端应用的框架。",
      "React 是一个用于构建用户界面的 JavaScript 库。"
    ],
    "topK": 1
  }'

curl -X POST http://localhost:3300/upload-files \
  -F "files=@./samples/demo.pdf" \
  -F "files=@./samples/demo.docx" \
  -F "chunkSize=400" \
  -F "chunkOverlap=80"

curl -X POST http://localhost:3300/chat/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "什么是 RAG？"}'
```

预期响应：

```json
{
  "code": 0,
  "data": { "insertedCount": 2 },
  "msg": "success"
}
```

文件上传接口的预期响应结构与 `/upload` 一致：

```json
{
  "code": 0,
  "data": {
    "documentCount": 2,
    "totalChunks": 6,
    "savedCount": 6,
    "failedCount": 0,
    "status": "success",
    "failures": []
  },
  "msg": "success"
}
```
