import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { NotificationListener } from './notification.listener';
import { JwtService } from '@nestjs/jwt';

@Module({
    imports: [PrismaModule],
    controllers: [NotificationController],
    providers: [NotificationService, EmailService, JwtService, NotificationListener],
    exports: [NotificationService, EmailService],
})
export class NotificationModule {}
