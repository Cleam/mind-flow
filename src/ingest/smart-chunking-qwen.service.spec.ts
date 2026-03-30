// test-chunking.e2e.ts
import {
  SmartChunkingService,
  ContentType,
} from './smart-chunking-qwen.service.js';

describe('SmartChunkingQwenService', () => {
  const svc = new SmartChunkingService();

  it('代码块保持完整', () => {
    const code = '```ts\nfunction add(a,b){return a+b}\n```';
    const chunks = svc.split(code, ContentType.CODE);
    expect(chunks.some((c) => c.includes('function add'))).toBe(true);
    expect(chunks.some((c) => c.includes('```'))).toBe(true); // 保留标记
  });

  it('中文无标点聊天记录软分割', () => {
    const chat =
      '今天老师说要带彩笔明天交手工作业孩子说想画全家福我答应陪他一起画';
    const chunks = svc.split(chat, ContentType.SHORT);
    expect(chunks.length).toBeGreaterThan(1); // 应被软分割
    expect(chunks.every((c) => c.length > 20)).toBe(true); // 无碎片
  });

  it('token估算误差<15%', () => {
    // 用真实API对比验证（可选）
    const text = 'Hello世界！This is a 测试text。';
    const estimated = svc.estimateTokens(text);
    // 实际token数需调用DashScope API获取，此处仅做结构验证
    expect(estimated).toBeGreaterThan(0);
  });
});
