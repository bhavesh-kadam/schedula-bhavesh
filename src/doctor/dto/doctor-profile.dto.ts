import { Transform, Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested, IsDateString, Matches } from "class-validator";
import { ActiveStatus, Day, OverrideType } from "src/generated/prisma/enums";

export class RecurringAvailabilityDto {
    @IsEnum(Day)
    dayOfWeek: Day;

    @IsNotEmpty()
    @IsString()
    @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be in HH:mm format' })
    startTime: string;

    @IsNotEmpty()
    @IsString()
    @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'endTime must be in HH:mm format' })
    endTime: string;
}

export class CustomAvailabilityDto {
    @IsNotEmpty()
    @IsDateString()
    date: string;

    @IsEnum(OverrideType)
    overrideType: OverrideType;

    @IsOptional()
    @IsDateString()
    startTime?: string;

    @IsOptional()
    @IsDateString()
    endTime?: string;
}

export class SaveProfileDto {
    @IsNotEmpty()
    @IsString()
    licenseNo: string;

    @IsNotEmpty()
    @IsString()
    specialization: string;

    @IsNotEmpty()
    @IsString()
    qualification: string;

    @IsNotEmpty()
    @IsNumber()
    yearsOfExperience: number;

    @IsNotEmpty()
    @IsNumber()
    consultationFee: number;

    @IsOptional()
    @IsString()
    profileDetails: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecurringAvailabilityDto)
    availability: RecurringAvailabilityDto[];
}

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    firstName: string;

    @IsOptional()
    @IsString()
    lastName: string;

    @IsOptional()
    @IsString()
    mobileNo: string;

    @IsOptional()
    @IsString()
    specialization: string;

    @IsOptional()
    @IsString()
    qualification: string;

    @IsOptional()
    @IsNumber()
    yearsOfExperience: number;

    @IsOptional()
    @IsNumber()
    consultationFee: number;

    @IsOptional()
    @IsString()
    profileDetails: string;

    @IsOptional()
    @IsEnum(ActiveStatus)
    activeStatus: ActiveStatus;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecurringAvailabilityDto)
    availability: RecurringAvailabilityDto[];
}

export class GetDoctorsQueryDto {
    @IsOptional()
    @IsString()
    specialization?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    @Max(100)
    limit = 10;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    availability?: boolean;
}

export class GetSlotsQueryDto {
    @IsNotEmpty()
    @IsDateString()
    date: string; // Format: YYYY-MM-DD

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @IsEnum([10, 15, 30, 60], { message: 'Duration must be either 10, 15, 30, or 60 minutes' })
    duration = 30; // Default slot duration to 30 minutes if not provided
}