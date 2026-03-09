# LLM Provider 策略模式架构说明

## 📋 架构重构概览

**重构时间**：2026-03-10  
**重构目标**：采用策略模式 (Strategy Pattern) 统一管理 LLM Provider，封装 Embedding 和 Rerank 两个核心功能，支持多种 LLM 提供商无缝切换。

---

## 🏗️ 核心架构

### 1. 策略模式接口层

#### LlmProvider 接口

定义所有 Provider 必须实现的标准方法：

```typescript
interface LlmProvider {
  getName(): string;
  embed(text: string): Promise<number[]>;
  batchEmbed(texts: string[]): Promise<number[][]>;
  rerank(query: string, documents: string[]): Promise<RerankResult[]>;
  isAvailable(): Promise<boolean>;
}
```

#### BaseLlmProvider 抽象基类

提供通用逻辑和默认实现：

- 向量维度验证 (1536)
- 文本输入校验
- 批量向量化默认串行实现
- HTTP 错误统一处理
- 配置合并与校验

---

## 🎯 Provider 实现

### QwenLlmProvider（阿里云百炼）

- **协议**：兼容 OpenAI 格式
- **Embedding**：`text-embedding-v3`（可配置）
- **Rerank**：`gte-rerank`（可配置）
- **特性**：支持批量 Embedding

**环境变量**：
```bash
QWEN_API_KEY="sk-xxx"
QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_EMBEDDING_MODEL="text-embedding-v3"
QWEN_RERANK_MODEL="gte-rerank"
```

---

### OpenAILlmProvider

- **协议**：OpenAI 官方 API
- **Embedding**：`text-embedding-3-small`（可配置）
- **Rerank**：降级策略（OpenAI 官方无 Rerank，返回原顺序 + 模拟分数）
- **特性**：支持批量 Embedding

**环境变量**：
```bash
OPENAI_API_KEY="sk-xxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_RERANK_MODEL="rerank-v1"
```

---

### OllamaLlmProvider（本地模型）

- **协议**：Ollama REST API
- **Embedding**：`nomic-embed-text`（可配置）
- **Rerank**：基于余弦相似度的向量重排
- **特性**：无需 API Key，支持本地离线部署

**环境变量**：
```bash
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_EMBEDDING_MODEL="nomic-embed-text"
OLLAMA_RERANK_MODEL="bge-reranker-base"
```

---

### MockLlmProvider（测试/开发环境）

- **用途**：无需外部 API，纯本地确定性模拟
- **Embedding**：基于文本哈希生成 1536 维向量（相同文本生成相同向量）
- **Rerank**：基于词汇重叠计算相关性分数
- **特性**：`isAvailable()` 总是返回 `true`

**环境变量**：
```bash
EMBEDDING_PROVIDER="mock"
```

---

## 🏭 工厂模式

### LlmProviderFactory

根据 `EMBEDDING_PROVIDER` 环境变量自动实例化相应 Provider：

```typescript
@Injectable()
export class LlmProviderFactory {
  createProvider(): LlmProvider {
    const provider = this.configService.get('EMBEDDING_PROVIDER', 'mock');
    
    switch (provider.toLowerCase()) {
      case 'qwen':   return new QwenLlmProvider({...});
      case 'openai': return new OpenAILlmProvider({...});
      case 'ollama': return new OllamaLlmProvider({...});
      default:       return new MockLlmProvider({});
    }
  }
}
```

---

## 📦 服务层

### EmbeddingService（重构后）

**职责**：向量化服务的统一入口，委托给当前 Provider

```typescript
@Injectable()
export class EmbeddingService {
  private readonly provider: LlmProvider;

  constructor(providerFactory: LlmProviderFactory) {
    this.provider = providerFactory.createProvider();
  }

  async embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    return this.provider.batchEmbed(texts);
  }
}
```

**变更点**：
- ❌ 删除所有 Provider 特定逻辑（Qwen/OpenAI 实现代码）
- ❌ 删除 `getProvider()`、`embedWithQwen()`、`embedWithOpenAI()` 等方法
- ✅ 简化为纯委托层，依赖注入 `LlmProviderFactory`

---

### RerankService（新增）

**职责**：语义重排服务，支持 `topK` 截断

```typescript
@Injectable()
export class RerankService {
  private readonly provider: LlmProvider;

  constructor(providerFactory: LlmProviderFactory) {
    this.provider = providerFactory.createProvider();
  }

  async rerank(
    query: string, 
    documents: string[], 
    topK?: number
  ): Promise<RerankResultItemDto[]> {
    const results = await this.provider.rerank(query, documents);
    return topK ? results.slice(0, topK) : results;
  }
}
```

---

## 🌐 API 端点

### POST /rerank（新增）

**请求体**：
```json
{
  "query": "如何使用 NestJS？",
  "documents": [
    "NestJS 是一个用于构建高效可扩展 Node.js 服务端应用的框架。",
    "React 是一个用于构建用户界面的 JavaScript 库。"
  ],
  "topK": 1
}
```

**响应体**：
```json
{
  "query": "如何使用 NestJS？",
  "results": [
    {
      "index": 0,
      "score": 0.95,
      "document": "NestJS 是一个用于构建高效可扩展 Node.js 服务端应用的框架。"
    }
  ]
}
```

**Controller**：
```typescript
@Controller('rerank')
export class RerankController {
  @Post()
  async rerank(@Body() body: RerankRequestDto): Promise<RerankResultDto> {
    const results = await this.rerankService.rerank(
      body.query, 
      body.documents, 
      body.topK
    );
    return new RerankResultDto(body.query, results);
  }
}
```

---

## 📂 文件结构

```
src/
  llm/
    providers/
      base/
        llm-provider.interface.ts    # 核心接口定义
        base-llm-provider.ts         # 抽象基类
      qwen/
        qwen-llm-provider.ts
      openai/
        openai-llm-provider.ts
      ollama/
        ollama-llm-provider.ts
      mock/
        mock-llm-provider.ts
    llm-provider.factory.ts          # Provider 工厂
    index.ts                         # 统一导出
  
  embedding/
    embedding.service.ts             # → 重构为委托层
    embedding.service.spec.ts        # → 更新测试使用 Mock Factory
    embedding.module.ts              # → 注入 LlmProviderFactory
  
  rerank/
    rerank.service.ts                # 新增
    rerank.controller.ts             # 新增
    rerank.module.ts                 # 新增
    dto/
      rerank-request.dto.ts
      rerank-result.dto.ts
  
  app.module.ts                      # → 导入 RerankModule
```

---

## ✅ 向后兼容性

### 现有接口无需改动

- `POST /test-ingest` 仍然使用默认 Provider（Mock 或配置的 Provider）
- `POST /upload` 仍然调用 `EmbeddingService.embed()`，内部透明切换 Provider
- 环境变量 `EMBEDDING_PROVIDER` 配置方式保持不变

### 测试迁移

**旧测试代码**（直接构造 `ConfigService` mock）：
```typescript
const service = new EmbeddingService({
  get: (key) => key === 'EMBEDDING_PROVIDER' ? 'mock' : undefined
} as ConfigService);
```

**新测试代码**（使用 `LlmProviderFactory` mock）：
```typescript
const mockFactory: LlmProviderFactory = {
  createProvider: () => new MockLlmProvider({})
} as LlmProviderFactory;

const service = new EmbeddingService(mockFactory);
```

---

## 🧪 测试覆盖

### 单元测试

- ✅ `EmbeddingService`：验证 Mock Provider 确定性向量生成
- ✅ `EmbeddingService`：验证空文本抛出 `BadRequestException`
- ✅ `EmbeddingService`：验证批量向量化
- ✅ `IngestService`：验证切片逻辑与嵌入集成

### E2E 测试

- ✅ `POST /test-ingest`：兼容性测试
- ✅ `POST /upload`：多文档上传 + 切片 + 向量化
- ✅ `POST /upload`：非法参数验证（`chunkOverlap >= chunkSize`）

### Lint & Build

- ✅ ESLint 0 错误 0 警告
- ✅ TypeScript 编译通过
- ✅ 所有测试套件通过（3 单元测试套件 + 1 E2E 测试套件）

---

## 🔧 如何添加新 Provider

1. 在 `src/llm/providers/your-provider/` 创建新文件
2. 继承 `BaseLlmProvider` 实现 `LlmProvider` 接口
3. 实现 `getName()`、`embed()`、`rerank()` 方法
4. 实现 `mergeWithDefaults()` 和 `validateConfig()` 方法
5. 在 `LlmProviderFactory.createProvider()` 中添加 case 分支
6. 在 `src/llm/index.ts` 导出新 Provider
7. 更新 `.env.example` 添加新 Provider 的环境变量

**示例**：
```typescript
export class CustomLlmProvider extends BaseLlmProvider {
  getName() { return 'Custom'; }
  
  async embed(text: string): Promise<number[]> {
    // 调用 Custom API
  }
  
  async rerank(query: string, documents: string[]) {
    // 实现重排逻辑
  }
  
  protected mergeWithDefaults(config) { ... }
  protected validateConfig() { ... }
}
```

---

## 📊 性能优化点

### 批量向量化优化

- **Qwen/OpenAI**：使用原生批量 API (`input: string[]`)，单次请求处理多个文本
- **Ollama**：暂无批量支持，降级为串行 `Promise.all(map(embed))`
- **Mock**：同步生成，无网络开销

### Provider 单例模式

`LlmProviderFactory.createProvider()` 在每次服务实例化时调用一次，Provider 实例在服务生命周期内复用：

```typescript
constructor(providerFactory: LlmProviderFactory) {
  this.provider = providerFactory.createProvider(); // 仅构造时创建一次
}
```

---

## 🚀 下一步规划

- [ ] 为 `RerankService` 添加单元测试
- [ ] 为 `POST /rerank` 添加 E2E 测试
- [ ] 优化 Ollama Rerank 逻辑（考虑使用 generate API 做基于生成的重排）
- [ ] 支持 Provider 配置热重载（监听环境变量变化）
- [ ] 添加 Provider 健康检查端点 (`GET /health/llm`)

---

**文档维护者**：GitHub Copilot  
**最后更新**：2026-03-10
