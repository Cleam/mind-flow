# mind-flow

知识如流 - AI知识库助手

当前已具备两条入库链路：

- `POST /upload`：接收 JSON 文本文档数组，适合程序内部或手工传文本。
- `POST /upload-files`：接收 multipart 文件，支持 `pdf/docx/md/txt` 解析后清洗、智能切片并入向量库。

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
