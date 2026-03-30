import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const datasource = process.env['DATABASE_URL'];
if (!datasource) {
  throw new Error('缺少 DATABASE_URL 环境变量');
}

const adapter = new PrismaPg({ connectionString: datasource });
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    // 1. 获取表的基础统计信息
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT "sessionId") as unique_sessions,
        MAX(octet_length("content"::text)) as max_content_size,
        AVG(octet_length("content"::text)) as avg_content_size
      FROM chat_messages
    `;

    console.log('=== 表统计信息 ===');
    console.log(
      JSON.stringify(
        stats,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      ),
    );

    // 2. 查看索引信息
    const indexes = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'chat_messages'
    `;

    console.log('\n=== 现有索引 ===');
    console.log(
      JSON.stringify(
        indexes,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      ),
    );

    // 3. 具体的 sessionId 数据统计
    const sessionId = 'sess_20260318_e422542ceeb343fbbf1d9109324cdea9';
    const sessionStats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as msg_count,
        SUM(octet_length("content"::text)) as total_content_size,
        MAX(octet_length("content"::text)) as max_msg_size,
        AVG(octet_length("content"::text)) as avg_msg_size
      FROM chat_messages
      WHERE "sessionId" = ${sessionId}
    `;

    console.log(`\n=== sessionId=${sessionId} 的数据统计 ===`);
    console.log(
      JSON.stringify(
        sessionStats,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      ),
    );

    // 4. 执行 EXPLAIN ANALYZE 获取实际执行计划
    console.log('\n=== EXPLAIN ANALYZE：当前查询（降序 + id二级排序）===');
    const explainCurrent: Array<{ ['QUERY PLAN']: string }> =
      await prisma.$queryRaw`
      EXPLAIN ANALYZE
      SELECT "id", "sessionId", "role", "content", "createdAt"
      FROM chat_messages
      WHERE "sessionId" = ${sessionId}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 10 OFFSET 0
    `;

    explainCurrent.forEach((row) => console.log(row['QUERY PLAN']));

    // 5. 简化排序的查询计划
    console.log('\n=== EXPLAIN ANALYZE：优化后查询（仅 createdAt DESC）===');
    const explainOptimized: Array<{ ['QUERY PLAN']: string }> =
      await prisma.$queryRaw`
      EXPLAIN ANALYZE
      SELECT "id", "sessionId", "role", "content", "createdAt"
      FROM chat_messages
      WHERE "sessionId" = ${sessionId}
      ORDER BY "createdAt" DESC
      LIMIT 10 OFFSET 0
    `;

    explainOptimized.forEach((row) => console.log(row['QUERY PLAN']));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
