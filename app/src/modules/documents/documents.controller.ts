import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { MoveDocumentDto } from './dto/move-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建文档' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 403, description: '没有权限' })
  async create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.create(createDocumentDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: '获取文档列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async findAll(
    @Query() queryDto: QueryDocumentsDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findAll(queryDto, user.userId);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索文档' })
  @ApiResponse({ status: 200, description: '搜索成功' })
  async search(
    @Query() searchQueryDto: SearchQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.search(searchQueryDto, user.userId);
  }

  @Get(':docId')
  @ApiOperation({ summary: '获取文档详情' })
  @ApiParam({ name: 'docId', description: '文档ID' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  @ApiResponse({ status: 403, description: '没有权限访问' })
  async findOne(
    @Param('docId') docId: string,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findOne(docId, user.userId);
  }

  @Get(':docId/content')
  @ApiOperation({ summary: '获取文档内容（渲染树）' })
  @ApiParam({ name: 'docId', description: '文档ID' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  async getContent(
    @Param('docId') docId: string,
    @Query('version') version: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.getContent(docId, version, user.userId);
  }

  @Patch(':docId')
  @ApiOperation({ summary: '更新文档元数据' })
  @ApiParam({ name: 'docId', description: '文档ID' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  @ApiResponse({ status: 403, description: '没有权限' })
  async update(
    @Param('docId') docId: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.update(docId, updateDocumentDto, user.userId);
  }

  @Post(':docId/publish')
  @ApiOperation({ summary: '发布文档' })
  @ApiParam({ name: 'docId', description: '文档ID' })
  @ApiResponse({ status: 200, description: '发布成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  @ApiResponse({ status: 403, description: '没有权限' })
  async publish(
    @Param('docId') docId: string,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.publish(docId, user.userId);
  }

  @Post(':docId/move')
  @ApiOperation({ summary: '移动文档' })
  @ApiParam({ name: 'docId', description: '文档ID' })
  @ApiResponse({ status: 200, description: '移动成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  @ApiResponse({ status: 403, description: '没有权限' })
  @ApiResponse({ status: 400, description: '移动操作无效' })
  async move(
    @Param('docId') docId: string,
    @Body() moveDocumentDto: MoveDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.move(docId, moveDocumentDto, user.userId);
  }

  @Delete(':docId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除文档' })
  @ApiParam({ name: 'docId', description: '文档ID' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  @ApiResponse({ status: 403, description: '没有权限' })
  async remove(
    @Param('docId') docId: string,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.remove(docId, user.userId);
  }
}
