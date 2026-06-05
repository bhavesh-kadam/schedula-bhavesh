import { IsDateString, IsEmail, IsEnum, IsNotEmpty, IsPhoneNumber, IsString, IsStrongPassword } from "class-validator";
import { Gender, Role } from "src/generated/prisma/enums";

export class RegisterDto {

    @IsNotEmpty()
    @IsString()
    firstName: string;

    @IsNotEmpty()
    @IsString()
    lastName: string;

    @IsNotEmpty()
    @IsPhoneNumber('IN')
    mobileNo: number;

    @IsNotEmpty()
    @IsEmail()
    email: string;

    @IsDateString()
    dob: Date;

    @IsNotEmpty()
    @IsEnum(Gender)
    gender: Gender

    @IsNotEmpty()
    @IsStrongPassword()
    password: string

    @IsNotEmpty()
    @IsEnum(Role)
    role: Role

}