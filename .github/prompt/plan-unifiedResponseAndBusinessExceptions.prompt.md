## Plan: 统一响应与业务异常体系

按你的约束，将 HTTP JSON 接口统一为前端始终接收成功态 HTTP 状态，前端只通过响应体 `code` 判断成功/失败；同时新增业务异常目录、双异常过滤器、请求日志、按日切割文件日志，以及默认 60 秒超时与路由级超时覆盖。实现上会保留“真实 HTTP 状态/异常类型”用于日志与排障，但对前端落地统一响应 `{ code, data, msg }`。

**Steps**

1. Phase 1 - 错误目录与响应约束建模（先行）
2. 新增 `biz-errors` 目录与错误码目录文件，定义 `BIZ_ERRORS`、`BizKey`、默认兜底业务码、目录校验函数，确保 code 唯一且可集中维护。_阻塞后续 2/3/4_
3. 新增 `BusinessException`（`BizException` 别名）与基础工厂/解析逻辑，支持按错误键抛出、兼容字符串兜底，并统一将业务异常内部状态设置为 `HttpStatus.OK`。_depends on 1_
4. 约定统一响应结构：成功 `{ code: 0, data, msg: 'success' }`；失败 `{ code: 非0, data: null, msg }`。即使发生 DTO 校验、超时、权限、未知异常，对前端返回的 HTTP 状态也保持成功态。_阻塞后续 2/4_
5. Phase 2 - 异常过滤器分层设计（核心）
6. 新增 `business-exception-filter`：专门处理 `BusinessException`，透传业务 code/msg，补充请求上下文日志。_depends on Phase 1_
7. 新增 `all-exceptions-filter`：兜底处理 `HttpException`、未知异常、框架异常与超时异常，将其映射到 `BIZ_ERRORS` 中的公共错误码，并统一返回 HTTP 200 + `{ code, data: null, msg }`。日志里保留真实 `status`、异常类型、stack。_depends on Phase 1_
8. 明确过滤器职责边界与注册顺序：`BusinessExceptionFilter` 在前，`AllExceptionsFilter` 兜底在后，避免业务异常被总过滤器先吞掉。_depends on 本阶段前两步_
9. Phase 3 - 响应包装与跳过规则
10. 新增 `wrap-response.interceptor`：仅包装成功路径，将普通 JSON 返回转成 `{ code: 0, data, msg: 'success' }`；若控制器已返回统一结构则幂等透传。_depends on Phase 1_
11. 新增跳过包装机制：通过 metadata 装饰器和响应对象识别，排除未来二进制、SSE、流式输出，避免破坏后续第 4 阶段接口。_parallel with 本阶段第 1 步_
12. 统一字段命名：对外统一使用 `msg`，不对外暴露 `message`；过滤器内部若接收到 Nest 默认异常响应，需要规范化为 `msg`。_depends on 本阶段第 1 步_
13. Phase 4 - 请求日志与超时治理
14. 新增日志模块与通用日志服务：封装 winston + daily rotate，落盘到项目 `tmp`，按日切割、保留 14 天、关键错误同步 console。_阻塞本阶段后续步骤_
15. 新增 `request-logging.interceptor`：记录 `timestamp、method、path、ip、ua、duration、responseStatus、bizCode、msg` 等字段；失败日志记录真实异常状态码、异常类型与 stack。_depends on 本阶段第 1 步_
16. 新增 `timeout.interceptor`：默认 60 秒，超时抛标准 `RequestTimeoutException` 或统一包装为业务超时异常，再由过滤器转换成 HTTP 200 + `REQUEST_TIME_OUT` 对应业务码。_depends on Phase 2_
17. 新增路由级超时装饰器（如 `@RequestTimeout(ms)`），供 `/upload-files` 等长耗时接口覆盖默认超时。_depends on 本阶段第 3 步_
18. Phase 5 - 启动注册与存量接口适配
19. 在 `main.ts` 注册全局组件：日志拦截器、超时拦截器、响应包装拦截器、业务异常过滤器、全异常过滤器；顺序保证“成功走包装，失败走过滤器”。_depends on Phase 2/3/4_
20. 在启动阶段执行 `assertBizCatalog()`，让重复错误码在应用启动时直接失败，避免运行期发现配置问题。_depends on Phase 1_
21. 评估并在当前耗时接口上添加超时覆盖，优先 `/upload-files`，必要时扩展 `/upload`、`/rerank`。_depends on Phase 4 第 4 步_
22. Phase 6 - 测试与文档回归
23. 更新 e2e 测试：成功与失败场景都断言 HTTP 200，业务成功 `code=0`，DTO 校验失败/业务异常/超时/未知异常断言对应业务 code 与 `msg`。
24. 增加单测：`BusinessException` 构造分支、`assertBizCatalog()` 唯一性校验、`wrap-response.interceptor`、`timeout.interceptor`、`business-exception-filter`、`all-exceptions-filter`、超时装饰器 metadata 读取。
25. 更新 `README.md`：所有示例响应改为统一结构，增加错误码约定与“前端只看 code”的说明。

**Relevant files**

- `/Users/lee/Documents/code/study/mind-flow/src/main.ts` — 全局拦截器/过滤器注册入口与启动校验挂载点
- `/Users/lee/Documents/code/study/mind-flow/src/app.module.ts` — 引入日志模块与公共 provider
- `/Users/lee/Documents/code/study/mind-flow/src/common/interceptors/wrap-response.interceptor.ts` — 统一成功响应包装
- `/Users/lee/Documents/code/study/mind-flow/src/common/interceptors/timeout.interceptor.ts` — 默认超时与路由级覆盖
- `/Users/lee/Documents/code/study/mind-flow/src/common/interceptors/request-logging.interceptor.ts` — 请求耗时与失败日志
- `/Users/lee/Documents/code/study/mind-flow/src/common/filters/business-exception.filter.ts` — 业务异常专属过滤器
- `/Users/lee/Documents/code/study/mind-flow/src/common/filters/all-exceptions.filter.ts` — 非业务异常兜底过滤器
- `/Users/lee/Documents/code/study/mind-flow/src/common/decorators/request-timeout.decorator.ts` — 路由级超时覆盖 metadata
- `/Users/lee/Documents/code/study/mind-flow/src/common/decorators/skip-wrap-response.decorator.ts` — 排除包装 metadata
- `/Users/lee/Documents/code/study/mind-flow/src/common/exceptions/business.exception.ts` — 业务异常类与别名导出
- `/Users/lee/Documents/code/study/mind-flow/src/common/errors/biz-errors.ts` — 业务错误码目录
- `/Users/lee/Documents/code/study/mind-flow/src/common/errors/assert-biz-catalog.ts` — 启动期错误码唯一性校验
- `/Users/lee/Documents/code/study/mind-flow/src/logger/logger.module.ts` — 日志基础设施模块
- `/Users/lee/Documents/code/study/mind-flow/src/logger/logger.service.ts` — 可注入日志服务
- `/Users/lee/Documents/code/study/mind-flow/package.json` — 新增日志依赖
- `/Users/lee/Documents/code/study/mind-flow/test/app.e2e-spec.ts` — HTTP 200 + `code` 判定的 e2e 回归
- `/Users/lee/Documents/code/study/mind-flow/README.md` — 对外 API 响应契约说明

**Verification**

1. 运行 `pnpm build`，确认 ESM 导入（`.js`）与新增异常/日志基础设施编译通过。
1. 运行 `pnpm test` 与 `pnpm test:e2e`，确认成功、参数错误、业务异常、超时、未知异常全部返回 HTTP 200，且业务码正确。
1. 手动验证 `/test-ingest`、`/upload`、`/upload-files`、`/rerank`，检查成功响应为 `{ code: 0, data, msg: 'success' }`。
1. 手动构造 DTO 校验失败与文件类型错误，确认前端仍收到 HTTP 200，但 `code` 为配置业务码，`data=null`。
1. 手动构造超时，确认前端收到 HTTP 200 + `REQUEST_TIME_OUT` 对应业务码；日志里仍能看到真实异常类别与原始状态语义。
1. 检查 `tmp` 日志按日切割，字段包含 timestamp/method/path/ip/ua/duration/responseStatus/bizCode/msg；失败日志含 stack，关键错误上屏。
1. 启动应用时验证 `assertBizCatalog()` 生效，重复 code 会直接阻止启动。

**Decisions**

- 已确认：前端看到的 HTTP JSON 响应统一为成功态，业务成败全部通过 `code` 判断。
- 已确认：统一响应字段继续使用 `code/data/msg`，不对外暴露 `message`。
- 已确认：新增 `BusinessException`、`business-exception-filter`、`all-exceptions-filter` 与 `biz-errors` 目录。
- 已确认：日志写项目 `tmp`，按日切割，14 天保留，关键错误打印 console。
- 已确认：全局默认超时 60 秒，并支持路由装饰器覆盖。
- 包含范围：HTTP JSON 接口统一包装与统一异常语义。
- 排除范围：真实二进制/SSE 返回不包装，但需预留机制。

**Further Considerations**

1. 这种“错误也返回 HTTP 200”的设计会削弱 HTTP 语义，对网关告警、APM、缓存、重试策略不友好；建议至少在日志中保留 `responseStatus/originalStatus`，必要时加响应头如 `x-error-code` 或 `x-origin-status` 供排障使用。
2. DTO 校验失败、权限失败、未知异常映射到哪些具体 `BIZ_ERRORS` 键，建议在实施前先固定映射表，避免不同过滤器各自判断。
