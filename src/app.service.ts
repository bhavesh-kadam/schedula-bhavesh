import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello there, and welcome to schedula-bhavesh, an Doctor Appointment Booking API and server, this is for demonstration purposes only, do not mistaken it for actual service';
  }
}
