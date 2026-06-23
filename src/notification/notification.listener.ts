import { Injectable, Logger } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { EmailService } from "./email.service";
import { OnEvent } from "@nestjs/event-emitter";
import { AppointmentBookedEvent, AppointmentCancelledEvent, AppointmentRescheduledEvent } from "./events/appointment.events";
import { NotificationType } from "src/generated/prisma/enums";

@Injectable()
export class NotificationListener {
    private readonly logger = new Logger(NotificationListener.name)

    constructor(
        private notificationService: NotificationService,
        private emailService: EmailService
    ) {}

    @OnEvent('appointment.booked') 
    async handleAppointmentBooked(event: AppointmentBookedEvent) {
        try {
            await this.notificationService.createNotification(
                event.patientId,
                'Appointment Confirmed',
                `Your appointment with Dr ${event.doctorName} on ${event.date} at ${event.startTime} has been confirmed.${event.tokenNumber ? ` Token #${event.tokenNumber}.`: ''}`,
                NotificationType.APPOINTMENT_BOOKED
            );

            await this.emailService.sendAppointmentBooked(event.patientEmail, {
                patientName: event.patientName,
                doctorName: event.doctorName,
                date: event.date,
                startTime: event.startTime,
                endTime: event.endTime,
                schedulingType: event.schedulingType,
                tokenNumber: event.tokenNumber,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to handle appointment.booked event: ${message}`);
        }
    }

    @OnEvent('appointment.cancelled') 
    async handleAppointmentCancelled(event: AppointmentCancelledEvent) {
        try {
            await this.notificationService.createNotification(
                event.patientId,
                'Appointment Cancelled',
                `Your appointment with Dr. ${event.doctorName} on ${event.date} at ${event.startTime} has been cancelled by ${event.cancelledBy === "DOCTOR" ? 'the doctor': 'you'}.`,
                NotificationType.APPOINTMENT_CANCELLED
            );

            await this.emailService.sendAppointmentCancelled(event.patientEmail, {
                patientName: event.patientName,
                doctorName: event.doctorName,
                date: event.date,
                startTime: event.startTime,
                cancelledBy: event.cancelledBy
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message: String(error);
            this.logger.error(`Failed to handle appointment.cancelled event: ${message}`)
        }
    }

    @OnEvent('appointment.rescheduled') 
    async handleAppointmentRescheduled(event: AppointmentRescheduledEvent) {
        try {
            await this.notificationService.createNotification(
                event.patientId,
                'Appointment Rescheduled',
                `Your appointment with Dr. ${event.doctorName} has been rescheduled from ${event.oldDate} ${event.oldStartTime} to ${event.newDate} at ${event.newStartTime}.`,
                NotificationType.APPOINTMENT_RESCHEDULED
            );

            await this.emailService.sendAppointmentRescheduled(event.patientEmail, {
                patientName: event.patientName,
                doctorName: event.doctorName,
                oldDate: event.oldDate,
                oldStartTime: event.oldStartTime,
                newDate: event.newDate,
                newStartTime: event.newStartTime,
                newEndTime: event.newEndTime,
                tokenNumber: event.tokenNumber,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message: String(error);
            this.logger.error(`Failed to handle appointment.rescheduled event: ${message}`);
        }
    }

}