import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";


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