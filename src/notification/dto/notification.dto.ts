import { IsEnum, IsNotEmpty, IsString, IsUUID } from "class-validator";
import { NotificationType } from "src/generated/prisma/enums";

export class GetNotificationDto {
    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    @Max(20)
    limit = 10;
}