import 'reflect-metadata';
import {
  REQUEST_TIMEOUT_METADATA_KEY,
  RequestTimeout,
} from './request-timeout.decorator.js';

describe('RequestTimeout decorator', () => {
  it('应写入 metadata', () => {
    class DemoController {
      @RequestTimeout(1234)
      demo(): void {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      DemoController.prototype,
      'demo',
    );
    const method: unknown = descriptor?.value;
    expect(typeof method).toBe('function');

    if (typeof method !== 'function') {
      throw new Error('demo 方法不存在');
    }

    expect(Reflect.getMetadata(REQUEST_TIMEOUT_METADATA_KEY, method)).toBe(
      1234,
    );
  });
});
