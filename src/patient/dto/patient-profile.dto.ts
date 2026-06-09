import { IsDateString, IsEnum, IsNumber, IsOptional, IsPhoneNumber, IsString } from "class-validator"
import { BloodGroup, Gender } from "src/generated/prisma/enums"

export class PatientProfileDto {

    @IsOptional()
    @IsString()
    firstName: string

    @IsOptional()
    @IsString()
    lastName: string

    @IsOptional()
    @IsDateString()
    dob: Date

    @IsOptional()
    @IsEnum(BloodGroup)
    bloodGroup: BloodGroup

    @IsOptional()
    @IsEnum(Gender)
    gender: Gender

    @IsOptional()
    @IsPhoneNumber('IN')
    mobileNo: string

    @IsOptional()
    @IsString()
    pastIllness: string
}