import { Type } from "class-transformer";
import {
  IsArray,
  IsISO8601,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

const LEVELS = ["debug", "info", "warn", "error"] as const;

export class SearchCursorDto {
  @IsISO8601()
  receivedAt!: string;

  @IsUUID()
  eventId!: string;
}

export class SearchLogsDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsArray()
  @IsIn(LEVELS, { each: true })
  levels?: string[];

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsObject()
  attrs?: Record<string, string>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchCursorDto)
  cursor?: SearchCursorDto;
}
