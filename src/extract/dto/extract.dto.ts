import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Field definition DTO
 */
export class FieldDefinitionDto {
  @ApiProperty({
    description: 'Field name/identifier',
    example: 'transaction_date',
  })
  @IsString()
  @IsNotEmpty()
  field: string;

  @ApiProperty({
    description: 'Human-readable description of what this field represents',
    example: 'The date the sale occurred',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}

/**
 * Extraction context DTO
 */
export class ExtractionContextDto {
  @ApiProperty({
    description: 'Business context description for the data being imported',
    example: 'Monthly sales report from regional distributors. Used for revenue forecasting.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Array of fields to extract from the data',
    type: [FieldDefinitionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FieldDefinitionDto)
  fields: FieldDefinitionDto[];
}

/**
 * Extract request options DTO
 */
export class ExtractOptionsDto {
  @ApiPropertyOptional({
    description: 'Whether to include columns that could not be mapped',
    default: false,
  })
  @IsOptional()
  includeUnmappedColumns?: boolean;

  @ApiPropertyOptional({
    description: 'How to handle null/empty values',
    enum: ['empty_string', 'null'],
    default: 'empty_string',
  })
  @IsOptional()
  @IsString()
  nullHandling?: 'empty_string' | 'null';
}

/**
 * Extract request body DTO (for JSON context)
 */
export class ExtractRequestBodyDto {
  @ApiPropertyOptional({
    description: 'Sheet name to process (for Excel files with multiple sheets)',
    example: 'Q1 Sales',
  })
  @IsOptional()
  @IsString()
  sheetName?: string;

  @ApiProperty({
    description: 'Extraction context including description and field definitions',
    type: ExtractionContextDto,
  })
  @ValidateNested()
  @Type(() => ExtractionContextDto)
  context: ExtractionContextDto;

  @ApiPropertyOptional({
    description: 'Extraction options',
    type: ExtractOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractOptionsDto)
  options?: ExtractOptionsDto;
}

