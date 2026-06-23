import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';

@Module({
    imports: [PrismaModule],
    controllers: [NotificationController],
    providers: [NotificationService, EmailService],
    exports: [NotificationService, EmailService],
})
export class NotificationModule {}
