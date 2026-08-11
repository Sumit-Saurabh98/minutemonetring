import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export class LogEventDto {
  @IsUUID()
  eventId!: string;

  @IsIn(LEVELS)
  level!: string;

  @IsString()
  @MaxLength(8192)
  message!: string;

  @IsOptional()
  attrs?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  timestamp?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  env?: string;
}

export class IngestLogsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LogEventDto)
  events!: LogEventDto[];
}
