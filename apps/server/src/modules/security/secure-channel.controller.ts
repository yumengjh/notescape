import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InitSecureChannelDto } from './dto/init-secure-channel.dto';
import { SecureChannelService } from './secure-channel.service';

@ApiTags('security')
@Controller('security/channel')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SecureChannelController {
  constructor(private readonly secureChannelService: SecureChannelService) {}

  @Post('init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '初始化安全通道（ECDH + 动态密钥）' })
  @ApiResponse({ status: 200, description: '初始化成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未认证或令牌无效' })
  async initSecureChannel(
    @CurrentUser() user: { userId: string },
    @Body() body: InitSecureChannelDto,
    @Req() request: Request,
  ) {
    return this.secureChannelService.initChannel({
      userId: user.userId,
      accessToken: this.resolveBearerToken(request),
      ipAddress: request.ip || request.socket?.remoteAddress || '0.0.0.0',
      userAgent: request.headers['user-agent'],
      body,
    });
  }

  private resolveBearerToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
