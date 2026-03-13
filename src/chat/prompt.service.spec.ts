import { PromptService } from './prompt.service.js';

describe('PromptService', () => {
  const service = new PromptService();

  it('should generate prompt with references', () => {
    const prompt = service.generatePrompt('什么是 RAG？', [
      {
        content: 'RAG 是检索增强生成。',
        source: 'doc-1',
        score: 0.91,
      },
    ]);

    expect(prompt).toContain('【参考资料】');
    expect(prompt).toContain('source=doc-1');
    expect(prompt).toContain('什么是 RAG？');
    expect(prompt).toContain('你必须只根据以下【参考资料】回答问题');
  });

  it('should include empty marker when no reference', () => {
    const prompt = service.generatePrompt('未知问题', []);

    expect(prompt).toContain('（无）');
    expect(prompt).toContain('不了解');
  });
});
