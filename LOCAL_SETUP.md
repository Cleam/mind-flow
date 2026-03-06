# 本地开发启动指南

## 前置要求
- Docker & Docker Compose 已安装
- Node.js 20+ 和 pnpm 已安装

## 快速启动

### 1. 启动 PostgreSQL 服务（包含 pgvector 支持）

```bash
docker-compose up -d
```

这会启动一个 pgvector/pgvector:pg16 容器，自动创建 `mind_flow` 数据库。

### 2. 初始化数据库模式

首先确保 pgvector 扩展已创建（通常在容器启动后自动完成，如需手动创建请运行）：

```bash
docker-compose exec postgres psql -U postgres -d mind_flow -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

然后执行 Prisma 迁移：

```bash
pnpm prisma:migrate:dev
```

首次运行时会自动创建 `init` 迁移文件。

### 3. 生成 Prisma 客户端

```bash
pnpm prisma:generate
```

### 4. 启动应用

开发模式：
```bash
pnpm start:dev
```

生产模式：
```bash
pnpm build
pnpm start:prod
```

### 5. 运行测试

```bash
pnpm test          # 单元测试
pnpm test:e2e      # e2e 测试
pnpm test:watch    # 监听模式
```

## 环境变量配置

工作目录已配置 `.env` 文件：

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mind_flow?schema=public"
PORT=3000
```

如需修改数据库连接，编辑 `.env` 文件即可。

## 常用命令

| 命令 | 说明 |
|------|------|
| `docker-compose up -d` | 启动 PostgreSQL |
| `docker-compose down` | 停止 PostgreSQL |
| `docker-compose logs postgres` | 查看 PostgreSQL 日志 |
| `docker-compose ps` | 查看容器状态 |
| `pnpm prisma studio` | 打开 Prisma Studio（可视化数据浏览） |
| `pnpm prisma migrate reset` | 重置数据库（删除所有数据） |

## troubleshooting

**问题：`P1001: Can't reach database server`**
- 解决：确保 Docker 容器已启动 `docker-compose up -d && sleep 10`

**问题：`ERROR: type "vector" does not exist`**
- 解决：手动创建 pgvector 扩展：
  ```bash
  docker-compose exec postgres psql -U postgres -d mind_flow -c "CREATE EXTENSION IF NOT EXISTS vector;"
  ```

**问题：需要清空数据库重新开始**
```bash
docker-compose down -v
rm -rf prisma/migrations/[migration-folder]
docker-compose up -d
# 然后重新执行迁移...
```
