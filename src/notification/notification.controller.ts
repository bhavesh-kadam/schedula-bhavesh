import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { GetNotificationDto } from './dto/notification.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { NotificationService } from './notification.service';

interface JwtPayload {
    sub: string;
    jti: string;
    firstName: string;
    email: string;
    role: Role;
}

@Controller('notifications')
@UseGuards(AuthGuard, RoleGuard)
@Roles(Role.PATIENT)
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get('unread-count')
    async getUnreadCount(
        @GetUser() user: JwtPayload
    ) {
        return this.notificationService.getUnreadCount(user.sub);
    }

    @Patch('read-all')
    async markAllAsRead(
        @GetUser() user: JwtPayload
    ) {
        return this.notificationService.markAllAsRead(user.sub);
    }

    @Get()
    async getNotifications(
        @GetUser() user: JwtPayload,
        @Query() query: GetNotificationDto
    ) {
        return this.notificationService.getNotification(user.sub, {
            page: query.page,
            limit: query.limit
        });
    }

    @Patch(':id/read') 
    async markAsRead (
        @GetUser() user: JwtPayload,
        @Param('id') notificationId: string,
    ) {
        return this.notificationService.markAsRead(user.sub, notificationId)
    }
}
