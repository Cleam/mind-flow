# mind-flow

知识如流 - AI知识库助手

## 阶段 1 已实现能力

- `DocumentChunk` 数据模型：`id`、`content`、`metadata(Json)`、`embedding(vector(1536))`
- Prisma migration 自动启用 `pgvector` 扩展
- `VectorService.saveChunk` 使用 `prisma.$executeRaw` 写入向量
- `POST /test-ingest`：接收字符串数组，使用随机向量模拟 embedding 后入库

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
```
