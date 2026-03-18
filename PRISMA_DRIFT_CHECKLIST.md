# Prisma Drift 排查与修复清单

适用场景：执行 `prisma migrate dev` 时出现以下报错之一。

- `was modified after it was applied`
- `Drift detected: Your database schema is not in sync with your migration history`
- `We need to reset the "public" schema`

## 1. 快速判断

1. 检查迁移状态。

```bash
npx prisma migrate status
```

2. 反查数据库真实结构（只看关键字段）。

```bash
npx prisma db pull --print | sed -n '1,220p'
```

3. 对照本地 schema 与数据库结构，确认是否有类型漂移。

本仓库高频漂移点：`document_chunks.embedding` 被数据库识别成 `vector`，而本地期望 `vector(1536)`。

## 2. 保数据修复（推荐）

先做这一步，再考虑重置数据库。

1. 确认漂移字段是否可无损收敛。

```sql
SELECT count(*)::int AS bad
FROM document_chunks
WHERE vector_dims(embedding) <> 1536;
```

若 `bad = 0`，说明可以无损改成 `vector(1536)`。

2. 计算本地迁移文件 checksum（示例：`20260306104056_rename_table`）。

```bash
node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFileSync } from 'node:fs'; const sql=readFileSync('prisma/migrations/20260306104056_rename_table/migration.sql','utf8'); console.log(createHash('sha256').update(sql).digest('hex'));"
```

3. 在事务中同步 checksum 并修复列类型。

```sql
BEGIN;

UPDATE _prisma_migrations
SET checksum = '<替换为第 2 步输出>'
WHERE migration_name = '20260306104056_rename_table';

ALTER TABLE document_chunks
ALTER COLUMN embedding TYPE vector(1536);

COMMIT;
```

4. 重新执行迁移并验证。

```bash
npx prisma migrate dev
npx prisma migrate status
```

预期结果：`Database schema is up to date!`

## 3. 可清库修复（开发环境）

仅当本地数据可丢弃时使用。

```bash
npx prisma migrate reset
npx prisma migrate dev
```

## 4. 常见陷阱

- 不要修改已应用过的迁移文件内容。
- 不要在数据库里手改 schema 后忘记补迁移。
- `migrate dev` 会先校验历史 migration checksum，再检查 drift；新增表也会被历史问题阻断。
- 远程数据库偶发不可达会导致 `P1001`，先确认连通性再判断是否是迁移问题。

## 5. 预防规范

1. 已应用迁移只追加，不回改。
2. 结构变更只通过 Prisma migration 进入数据库。
3. 每次发版前执行一次：

```bash
npx prisma migrate status
```

4. 出现 drift 先走“保数据修复”，再考虑 reset。
