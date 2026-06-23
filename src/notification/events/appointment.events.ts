export class AppointmentBookedEvent {
    constructor(
        public readonly patientId: string,
        public readonly patientEmail: string,
        public readonly patientName: string,
        public readonly doctorName: string,
        public readonly date: string,
        public readonly startTime: string,
        public readonly endTime: string,
        public readonly schedulingType: string,
        public readonly tokenNumber?: number,
    ) {}
}

export class AppointmentCancelledEvent {
    constructor(
        public readonly patientId: string,
        public readonly patientEmail: string,
        public readonly patientName: string,
        public readonly doctorName: string,
        public readonly date: string,
        public readonly startTime: string,
        public readonly cancelledBy: 'DOCTOR' | 'PATIENT',
    ) {}
}

export class AppointmentRescheduledEvent {
    constructor(
        public readonly patientId: string,
        public readonly patientEmail: string,
        public readonly patientName: string,
        public readonly doctorName: string,
        public readonly oldDate: string,
        public readonly oldStartTime: string,
        public readonly newDate: string,
        public readonly newStartTime: string,
        public readonly newEndTime: string,
        public readonly tokenNumber?: number,
    ) {}
}