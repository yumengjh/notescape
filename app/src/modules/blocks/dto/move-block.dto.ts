import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MoveBlockDto {
  @ApiProperty({ description: '目标父块ID', example: 'b_1234567890_abc123' })
  @IsString()
  parentId: string;

  @ApiProperty({ description: '排序键', example: '0.5' })
  @IsString()
  sortKey: string;

  @ApiPropertyOptional({ description: '缩进级别', example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  indent?: number;
}
