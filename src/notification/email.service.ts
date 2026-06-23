import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailService.name);

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: false, // TLS
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    async sendAppointmentBooked(to: string, payload: {
        patientName: string;
        doctorName: string;
        date: string;
        startTime: string;
        endTime: string;
        schedulingType: string;
        tokenNumber?: number;
    }) {
        const subject = `Appointment Confirmed — Dr. ${payload.doctorName}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #2e7d32;">Appointment Confirmed</h2>
                <p>Hi <strong>${payload.patientName}</strong>,</p>
                <p>Your appointment has been successfully booked. Here are the details:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr><td style="padding: 8px; color: #555;">Doctor</td><td style="padding: 8px;"><strong>Dr. ${payload.doctorName}</strong></td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding: 8px; color: #555;">Date</td><td style="padding: 8px;"><strong>${payload.date}</strong></td></tr>
                    <tr><td style="padding: 8px; color: #555;">Time</td><td style="padding: 8px;"><strong>${payload.startTime} – ${payload.endTime}</strong></td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding: 8px; color: #555;">Type</td><td style="padding: 8px;"><strong>${payload.schedulingType}</strong></td></tr>
                    ${payload.tokenNumber ? `<tr><td style="padding: 8px; color: #555;">Token No.</td><td style="padding: 8px;"><strong>#${payload.tokenNumber}</strong></td></tr>` : ''}
                </table>
                <p style="margin-top: 24px; color: #888; font-size: 13px;">Please arrive 10 minutes before your scheduled time.</p>
            </div>
        `;
        await this.send(to, subject, html);
    }

    async sendAppointmentCancelled(to: string, payload: {
        patientName: string;
        doctorName: string;
        date: string;
        startTime: string;
        cancelledBy: 'DOCTOR' | 'PATIENT';
    }) {
        const subject = `Appointment Cancelled — Dr. ${payload.doctorName}`;
        const cancelledByText = payload.cancelledBy === 'DOCTOR'
            ? `This appointment was cancelled by Dr. ${payload.doctorName}.`
            : 'You have cancelled this appointment.';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #c62828;">Appointment Cancelled</h2>
                <p>Hi <strong>${payload.patientName}</strong>,</p>
                <p>${cancelledByText}</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr><td style="padding: 8px; color: #555;">Doctor</td><td style="padding: 8px;"><strong>Dr. ${payload.doctorName}</strong></td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding: 8px; color: #555;">Date</td><td style="padding: 8px;"><strong>${payload.date}</strong></td></tr>
                    <tr><td style="padding: 8px; color: #555;">Time</td><td style="padding: 8px;"><strong>${payload.startTime}</strong></td></tr>
                </table>
                <p style="margin-top: 24px;">You can book a new appointment at any time.</p>
            </div>
        `;
        await this.send(to, subject, html);
    }

    async sendAppointmentRescheduled(to: string, payload: {
        patientName: string;
        doctorName: string;
        oldDate: string;
        oldStartTime: string;
        newDate: string;
        newStartTime: string;
        newEndTime: string;
        tokenNumber?: number;
    }) {
        const subject = `Appointment Rescheduled — Dr. ${payload.doctorName}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #1565c0;">Appointment Rescheduled</h2>
                <p>Hi <strong>${payload.patientName}</strong>,</p>
                <p>Your appointment with <strong>Dr. ${payload.doctorName}</strong> has been rescheduled.</p>
                <h4 style="color:#888; margin-top: 16px;">Previous Slot</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; color: #555;">Date</td><td style="padding: 8px;"><s>${payload.oldDate}</s></td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding: 8px; color: #555;">Time</td><td style="padding: 8px;"><s>${payload.oldStartTime}</s></td></tr>
                </table>
                <h4 style="color:#2e7d32; margin-top: 16px;">New Slot</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; color: #555;">Date</td><td style="padding: 8px;"><strong>${payload.newDate}</strong></td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding: 8px; color: #555;">Time</td><td style="padding: 8px;"><strong>${payload.newStartTime} – ${payload.newEndTime}</strong></td></tr>
                    ${payload.tokenNumber ? `<tr><td style="padding: 8px; color: #555;">Token No.</td><td style="padding: 8px;"><strong>#${payload.tokenNumber}</strong></td></tr>` : ''}
                </table>
                <p style="margin-top: 24px; color: #888; font-size: 13px;">Please arrive 10 minutes before your scheduled time.</p>
            </div>
        `;
        await this.send(to, subject, html);
    }

    // --- INTERNAL: core send method ---
    private async send(to: string, subject: string, html: string) {
        try {
            await this.transporter.sendMail({
                from: `"Schedula Bhavesh" <${process.env.SMTP_FROM}>`,
                to,
                subject,
                html,
            });
            this.logger.log(`Email sent to ${to} — ${subject}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to send email to ${to}: ${message}`);
        }
    }
}