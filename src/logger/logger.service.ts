import { Injectable, LoggerService } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export interface LogMeta {
  [key: string]: unknown;
}

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    const logDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      transports: [
        new DailyRotateFile({
          dirname: logDir,
          filename: 'application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '14d',
          zippedArchive: false,
        }),
        new DailyRotateFile({
          dirname: logDir,
          filename: 'error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '14d',
          level: 'error',
          zippedArchive: false,
        }),
        new winston.transports.Console({ level: 'error' }),
      ],
    });
  }

  log(message: string, meta?: LogMeta): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: LogMeta): void {
    this.logger.debug(message, meta);
  }

  verbose(message: string, meta?: LogMeta): void {
    this.logger.verbose(message, meta);
  }
}
