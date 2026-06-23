import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetNotificationDto } from './dto/notification.dto';
import { NotificationType } from 'src/generated/prisma/enums';


@Injectable()
export class NotificationService {
    constructor (
        private prisma: PrismaService
    ) {}

    async createNotification (
        patientId: string,
        title: string,
        message: string,
        type: NotificationType
    ) {
        return this.prisma.notification.create({
            data: {
                patientId,
                title,
                message,
                type,
            }
        });
    }

    async getNotification(userId: string, dto: GetNotificationDto) {

        const patient = await this.prisma.patient.findUnique({
            where: {
                userId: userId,
            }
        });

        if (!patient) {
            throw new NotFoundException("Patient profile not found");
        }

        const notifications = await this.prisma.notification.findMany({
            where: { patientId: patient.id },
            orderBy: { createdAt: 'desc' },
            take: dto.limit,
            skip: (dto.page - 1) * dto.limit
        });

        if (notifications.length === 0) {
            return {
                message: 'No notification found.'
            };
        }

        return notifications
    }

    async markAsRead(userId: string, notificationId: string) {
        const patient = await this.prisma.patient.findUnique({
            where: { userId: userId, }
        });

        if (!patient) {
            throw new NotFoundException("Patient profile not found");
        }

        const notification = await this.prisma.notification.findUnique({
            where: {
                id: notificationId,
            }
        });

        if (!notification) {
            throw new NotFoundException("Notification not found");
        }

        if (notification.patientId !== patient.id) {
            throw new ForbiddenException("Access denied: This notification does not belong to you");
        }

        if (notification.isRead) {
            return { message: "Notification is already marked as read"}
        }

        return this.prisma.notification.update({
            where: {
                id: notificationId,
            },
            data: {
                isRead: true,
            }
        });
    }

    async markAllAsRead (userId: string) {
        const patient = await this.prisma.patient.findUnique({
            where: {userId,}
        });

        if (!patient) {
            throw new NotFoundException("Patient profile not found");
        }

        const result = await this.prisma.notification.updateMany({
            where: { patientId: patient.id, isRead: false},
            data: { isRead: true, }
        });

        return {
            updatedCount: result.count,
            message: `${result.count} notification(s) marked as read.`
        };
    }

    async getUnreadCount( userId: string) {
        const patient = await this.prisma.patient.findUnique({
            where: { userId },
        });

        if (!patient) {
            throw new NotFoundException("Patient profile not found");
        }

        const count = await this.prisma.notification.count({
            where: { patientId: patient.id, isRead: false}
        });

        return {
            unreadCount: count,
            ...(count === 0 && {message: "No new notificaions to read"})
        }
    }
}
