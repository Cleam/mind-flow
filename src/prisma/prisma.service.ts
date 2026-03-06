import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const datasource = process.env['DATABASE_URL'];
    if (!datasource) {
      throw new Error('缺少 DATABASE_URL 环境变量');
    }

    const adapter = new PrismaPg({ connectionString: datasource });
    super({ adapter });
  }
}
