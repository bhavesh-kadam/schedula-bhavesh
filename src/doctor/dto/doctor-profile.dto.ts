import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator"
import { ActiveStatus, Day } from "src/generated/prisma/enums"

export class AvailabilityDto {
    @IsEnum(Day)
    dayOfWeek: Day;

    @IsInt()
    startHour: number;

    @IsInt()
    endHour: number;
}

export class SaveProfileDto {

    @IsNotEmpty()
    @IsString()
    licenseNo: string

    @IsNotEmpty()
    @IsString()
    specialization: string

    @IsNotEmpty()
    @IsString()
    qualification: string

    @IsNotEmpty()
    @IsNumber()
    yearsOfExperience: number

    @IsNotEmpty()
    @IsNumber()
    consultationFee: number

    @IsOptional()
    @IsString()
    profileDetails: string

    @IsArray()
    @ValidateNested({ each: true})
    @Type(() => AvailabilityDto)
    availability: AvailabilityDto[];

}

export class UpdateProfileDto {

    @IsOptional()
    @IsString()
    firstName: string

    @IsOptional()
    @IsString()
    lastName: string

    @IsOptional()
    @IsString()
    mobileNo: string

    @IsOptional()
    @IsString()
    specialization: string

    @IsOptional()
    @IsString()
    qualification: string

    @IsOptional()
    @IsNumber()
    yearsOfExperience: number

    @IsOptional()
    @IsNumber()
    consultationFee: number

    @IsOptional()
    @IsString()
    profileDetails: string

    @IsOptional()
    @IsEnum(ActiveStatus)
    activeStatus: ActiveStatus

    @IsArray()
    @ValidateNested({ each: true})
    @Type(() => AvailabilityDto)
    availability: AvailabilityDto[];
}