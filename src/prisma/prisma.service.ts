import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'src/generated/prisma/client';
import 'dotenv/config'

@Injectable()
export class PrismaService extends PrismaClient {
    constructor() {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL as string,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 30000,
        });
        super({
            adapter,
            log: ['query', 'error', 'warn'],
        });
    }
}