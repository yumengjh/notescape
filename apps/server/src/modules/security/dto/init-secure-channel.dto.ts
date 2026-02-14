import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class InitSecureChannelDto {
  @ApiProperty({
    description: '客户端 ECDH 公钥，格式为 base64(spki)',
    example: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEv/Yo6aP1A+Y9zV2v3l4jow...',
  })
  @IsString()
  @MinLength(1)
  clientPublicKey: string;

  @ApiProperty({
    description: '客户端随机数，格式为 base64(16B)',
    example: 'f8f1VVE4l3Q2W4X9LhoQDw==',
  })
  @IsString()
  @MinLength(1)
  clientRandom: string;

  @ApiPropertyOptional({
    description: '设备标识（用于区分多端会话）',
    example: 'web-7a8c6f4d-0f91-4a7f-8ed9-6382f0a8c6ad',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}
