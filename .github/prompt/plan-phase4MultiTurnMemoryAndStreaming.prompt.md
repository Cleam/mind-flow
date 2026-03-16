## Plan: 阶段4 多轮记忆与流式输出

在保留现有 POST /chat/ask 行为不变的前提下，新增会话持久化、问题重写与流式输出能力；流式先落地 token 级输出，并提前设计统一事件协议，后续可平滑升级到"阶段事件+token 双流"。

---

### Phase A — 数据模型与会话持久化（后续所有步骤依赖此阶段完成）

1. 修改 `prisma/schema.prisma`：新增 `ChatMessage` 模型（`id`、`sessionId`、`role: enum(user,assistant)`、`content`、`createdAt`）及 `@@index([sessionId, createdAt])` 复合索引
2. 运行 `pnpm prisma:migrate:dev` + `pnpm prisma:generate`，确认客户端含新类型
3. 新建 `src/chat/conversation.service.ts`，实现：
   - `saveMessage(sessionId, role, content)`
   - `getHistory(sessionId, limit=10, offset=0)` → 查询倒序、返回正序
4. 在 `ChatModule` 中导入 `PrismaModule` 并注册 `ConversationService`

---

### Phase B — 问题改写（依赖 A）

5. 新建 `src/chat/query-rewrite.service.ts`，实现 `rewrite(question, history[]): Promise<string>`：调用 `LlmProvider.generate()` 将最近 3 轮（6 条）历史上下文改写为独立检索词；失败时降级返回原问题
6. 在 `ChatModule` 注册 `QueryRewriteService`
7. 扩展 `ChatService.askWithHistory(sessionId, question, opts)`：读历史 → rewrite → embed → search/rerank → prompt → generate → 写 user/assistant 消息

---

### Phase C — 流式能力（_并行于 B 后半_，最终收口依赖 B）

8. 扩展 `LlmProvider` 接口（`llm-provider.interface.ts`）：新增 `generateStream(prompt, abortSignal?): AsyncIterable<string>`
9. `BaseLlmProvider`：声明抽象方法
10. 各 Provider 实现：
    - **Qwen / OpenAI**：`chat/completions` with `stream: true`，逐行解析 `data: ` SSE delta
    - **Ollama**：`/api/generate` with `stream: true`，逐行 JSON 解析
    - **Mock**：同步将固定回答拆词 yield，支持 `AbortSignal.aborted` 检查
11. `ChatService`：新增 `askWithHistoryStream(sessionId, question, opts)` 返回 `AsyncIterable` —— 按 SSE 协议依次发 `token`、`done`（含 `answer`/`sources`/`rewriteQuery`）、`error`；客户端断开后通过 `AbortController` 取消上游流

---

### Phase D — DTO & 端点（并行于 C）

12. 新增 DTO：
    - `AskWithSessionDto`（`sessionId: string`、继承 `question/topK/threshold`）
    - `ChatHistoryQueryDto`（`sessionId`、`limit`、`offset`）
    - `StreamQueryDto`（GET query 用）/ `StreamBodyDto`（POST body 用）
13. `ChatController` 新增四个端点：
    - `GET /chat/stream` — `@Sse` + `StreamQueryDto`
    - `POST /chat/stream` — `@Sse` + `StreamBodyDto`
    - `GET /chat/history` — 普通 JSON 分页返回历史
    - （复用已有 `POST /chat/ask`，无改动）
14. SSE 响应体不走 `WrapResponseInterceptor`，使用 `@SkipWrapResponse()` 装饰器

---

### Phase E — 测试补齐（依赖 A-D 完成）

15. 单测：`ConversationService`（分页、隔离）、`QueryRewriteService`（降级）、`ChatService`（有/无历史、消息写入顺序）、Provider 流式解析
16. e2e：旧 `/ask` 回归、`/stream` 消费 token + done、`/history` 分页、sessionId 隔离

---

### 关键文件修改清单

| 文件                                                                    | 操作                                |
| ----------------------------------------------------------------------- | ----------------------------------- |
| `prisma/schema.prisma`                                                  | 新增 `ChatMessage` + 复合索引       |
| `src/llm/providers/base/llm-provider.interface.ts`                      | 扩展 `generateStream`               |
| `src/llm/providers/base/base-llm-provider.ts`                           | 添加抽象 `generateStream`           |
| `src/llm/providers/qwen/qwen-llm-provider.ts`                           | 实现 token 流解析                   |
| `src/llm/providers/openai/openai-llm-provider.ts`                       | 实现 token 流解析                   |
| `src/llm/providers/ollama/ollama-llm-provider.ts`                       | 实现 token 流解析                   |
| `src/llm/providers/mock/mock-llm-provider.ts`                           | 模拟 token 流                       |
| `src/chat/chat.module.ts`                                               | 注入新服务与 PrismaModule           |
| `src/chat/chat.controller.ts`                                           | 新增 stream/history 端点            |
| `src/chat/chat.service.ts`                                              | 新增 `askWithHistory` + stream 编排 |
| 新增：`conversation.service.ts` / `query-rewrite.service.ts` / 多个 DTO | 创建                                |
| `src/chat/chat.service.spec.ts` + `test/chat.e2e-spec.ts`               | 补充测试                            |

---

### 验收命令

1. `pnpm prisma:generate` — 确认 `ChatMessage` 出现在类型定义
2. `pnpm build` — 构建无类型报错
3. `pnpm test` — 单测全绿
4. `pnpm test:e2e` — e2e 全绿（旧 ask 不回归）
5. 手工：
   ```bash
   curl --no-buffer "http://localhost:3000/chat/stream?sessionId=s1&question=什么是RAG"
   curl --no-buffer -X POST http://localhost:3000/chat/stream -H "Content-Type:application/json" -d '{"sessionId":"s1","question":"再详细说说"}'
   ```

---

### Decisions

- ✅ GET + POST 两种 stream 端点均支持
- ✅ 历史分页：offset/limit
- ✅ 本期先实现 token 级流式，`done` 事件携带完整 `answer`/`sources`/`rewriteQuery`；协议预留 `meta` 字段（后续阶段事件用）
- ✅ 旧 `POST /chat/ask` 保持不变，不破坏现有 e2e
- ❌ 范围外：向量维度动态化、历史语义压缩（长期记忆）、前端 UI

---

### Further Considerations

1. **保存消息时机**：建议 user 消息在 `askWithHistory` 链路开始时写入，assistant 消息在成功生成后写入，失败时不写 assistant（避免空/错答案污染历史）
2. **`done` 事件与 WrapResponse 冲突**：SSE 端点需加 `@SkipWrapResponse()` 装饰器，否则外层会包裹一层 `code/msg/data`，EventSource 无法直接解析
3. **测试中流式验收**：e2e 测试使用 supertest 无法直接消费 SSE；建议用 Node 的 `fetch()` + `ReadableStream` 读取或直接 mock `ChatService.askWithHistoryStream`
4. **并发隔离**：所有历史读取/写入都强制 `sessionId` 条件，禁止进程级共享可变状态
5. **历史读取顺序**：查询倒序、返回正序，避免前端拼接消息时逆序处理复杂化
6. **`rewriteQuery` 透出**：在 `done` 事件中返回，便于可观测性与调试
