import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Block } from '../../entities/block.entity';
import { BlockVersion } from '../../entities/block-version.entity';
import { Document } from '../../entities/document.entity';
import { DocumentsService } from '../documents/documents.service';
import { generateBlockId, generateVersionId } from '../../common/utils/id-generator.util';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { MoveBlockDto } from './dto/move-block.dto';
import { BatchBlockDto } from './dto/batch-block.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(Block)
    private blockRepository: Repository<Block>,
    @InjectRepository(BlockVersion)
    private blockVersionRepository: Repository<BlockVersion>,
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    @InjectDataSource()
    private dataSource: DataSource,
    private documentsService: DocumentsService,
  ) {}

  /**
   * 创建块
   */
  async create(createBlockDto: CreateBlockDto, userId: string) {
    // 检查文档权限
    await this.documentsService.findOne(createBlockDto.docId, userId);

    // 如果指定了父块，验证父块存在
    // 只有当 parentId 是有效的非空字符串时才检查
    if (createBlockDto.parentId && typeof createBlockDto.parentId === 'string' && createBlockDto.parentId.trim() !== '') {
      const parentBlock = await this.blockRepository.findOne({
        where: { blockId: createBlockDto.parentId, isDeleted: false },
      });
      if (!parentBlock) {
        throw new NotFoundException('父块不存在');
      }
      if (parentBlock.docId !== createBlockDto.docId) {
        throw new BadRequestException('父块必须属于同一文档');
      }
    }

    // 使用事务创建块和初始版本
    return await this.dataSource.transaction(async (manager) => {
      const now = Date.now();
      const blockId = generateBlockId();
      const sortKey = createBlockDto.sortKey || this.generateSortKey(createBlockDto.parentId);

      // 创建块
      const block = manager.create(Block, {
        blockId,
        docId: createBlockDto.docId,
        type: createBlockDto.type,
        createdAt: now,
        createdBy: userId,
        latestVer: 1,
        latestAt: now,
        latestBy: userId,
        isDeleted: false,
      });

      await manager.save(Block, block);

      // 创建初始版本
      const hash = this.calculateHash(createBlockDto.payload);
      const blockVersion = manager.create(BlockVersion, {
        versionId: generateVersionId(blockId, 1),
        docId: createBlockDto.docId,
        blockId,
        ver: 1,
        createdAt: now,
        createdBy: userId,
        parentId: createBlockDto.parentId || '',
        sortKey,
        indent: createBlockDto.indent || 0,
        collapsed: createBlockDto.collapsed || false,
        payload: createBlockDto.payload,
        hash,
        plainText: this.extractPlainText(createBlockDto.payload),
        refs: [],
      });

      await manager.save(BlockVersion, blockVersion);

      // 更新文档版本号
      await this.incrementDocumentHead(createBlockDto.docId, userId, manager);

      return {
        blockId,
        docId: createBlockDto.docId,
        type: createBlockDto.type,
        version: 1,
        payload: createBlockDto.payload,
      };
    });
  }

  /**
   * 更新块内容
   */
  async updateContent(blockId: string, updateBlockDto: UpdateBlockDto, userId: string) {
    const block = await this.blockRepository.findOne({
      where: { blockId, isDeleted: false },
    });

    if (!block) {
      throw new NotFoundException('块不存在');
    }

    // 检查文档权限
    await this.documentsService.findOne(block.docId, userId);

    // 使用事务创建新版本
    return await this.dataSource.transaction(async (manager) => {
      const now = Date.now();
      const newVer = block.latestVer + 1;
      const hash = this.calculateHash(updateBlockDto.payload);

      // 检查内容是否真的改变了
      const latestVersion = await manager.findOne(BlockVersion, {
        where: { blockId, ver: block.latestVer },
      });

      if (latestVersion && latestVersion.hash === hash) {
        // 内容没有变化，返回当前版本
        return {
          blockId,
          version: block.latestVer,
          payload: latestVersion.payload,
        };
      }

      // 获取最新版本的结构信息
      const latestVersionInfo = await manager.findOne(BlockVersion, {
        where: { blockId, ver: block.latestVer },
      });

      // 创建新版本
      const blockVersion = manager.create(BlockVersion, {
        versionId: generateVersionId(blockId, newVer),
        docId: block.docId,
        blockId,
        ver: newVer,
        createdAt: now,
        createdBy: userId,
        parentId: latestVersionInfo?.parentId || '',
        sortKey: latestVersionInfo?.sortKey || '0',
        indent: latestVersionInfo?.indent || 0,
        collapsed: latestVersionInfo?.collapsed || false,
        payload: updateBlockDto.payload,
        hash,
        plainText: updateBlockDto.plainText || this.extractPlainText(updateBlockDto.payload),
        refs: [],
      });

      await manager.save(BlockVersion, blockVersion);

      // 更新块的最新版本信息
      block.latestVer = newVer;
      block.latestAt = now;
      block.latestBy = userId;
      await manager.save(Block, block);

      // 更新文档版本号
      await this.incrementDocumentHead(block.docId, userId, manager);

      return {
        blockId,
        version: newVer,
        payload: updateBlockDto.payload,
      };
    });
  }

  /**
   * 计算内容的哈希值
   */
  private calculateHash(content: any): string {
    const str = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * 从 payload 中提取纯文本
   */
  private extractPlainText(payload: any): string {
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload?.text) {
      return payload.text;
    }
    if (payload?.content) {
      return Array.isArray(payload.content)
        ? payload.content.map((c: any) => this.extractPlainText(c)).join(' ')
        : String(payload.content);
    }
    return JSON.stringify(payload);
  }

  /**
   * 生成排序键
   */
  private generateSortKey(parentId?: string): string {
    // 简化实现，实际应该使用更复杂的排序算法
    return Date.now().toString();
  }

  /**
   * 增加文档版本号
   */
  private async incrementDocumentHead(
    docId: string,
    userId: string,
    manager: any,
  ): Promise<void> {
    const document = await manager.findOne(Document, { where: { docId } });
    if (document) {
      document.head += 1;
      document.updatedBy = userId;
      await manager.save(Document, document);
    }
  }

  /**
   * 移动块
   */
  async move(blockId: string, moveBlockDto: MoveBlockDto, userId: string) {
    const block = await this.blockRepository.findOne({
      where: { blockId, isDeleted: false },
    });

    if (!block) {
      throw new NotFoundException('块不存在');
    }

    // 检查文档权限
    await this.documentsService.findOne(block.docId, userId);

    // 验证父块
    if (moveBlockDto.parentId) {
      const parentBlock = await this.blockRepository.findOne({
        where: { blockId: moveBlockDto.parentId, isDeleted: false },
      });
      if (!parentBlock) {
        throw new NotFoundException('父块不存在');
      }
      if (parentBlock.docId !== block.docId) {
        throw new BadRequestException('父块必须属于同一文档');
      }
      // 防止循环引用
      if (await this.wouldCreateCycle(blockId, moveBlockDto.parentId)) {
        throw new BadRequestException('移动操作会导致循环引用');
      }
    }

    // 使用事务更新块位置
    return await this.dataSource.transaction(async (manager) => {
      const now = Date.now();
      const latestVersion = await manager.findOne(BlockVersion, {
        where: { blockId, ver: block.latestVer },
      });

      if (!latestVersion) {
        throw new NotFoundException('块版本不存在');
      }

      // 创建新版本（移动操作会创建新版本）
      const newVer = block.latestVer + 1;
      const blockVersion = manager.create(BlockVersion, {
        versionId: generateVersionId(blockId, newVer),
        docId: block.docId,
        blockId,
        ver: newVer,
        createdAt: now,
        createdBy: userId,
        parentId: moveBlockDto.parentId || '',
        sortKey: moveBlockDto.sortKey,
        indent: moveBlockDto.indent || 0,
        collapsed: latestVersion.collapsed,
        payload: latestVersion.payload,
        hash: latestVersion.hash,
        plainText: latestVersion.plainText,
        refs: latestVersion.refs,
      });

      await manager.save(BlockVersion, blockVersion);

      // 更新块的最新版本信息
      block.latestVer = newVer;
      block.latestAt = now;
      block.latestBy = userId;
      await manager.save(Block, block);

      // 更新文档版本号
      await this.incrementDocumentHead(block.docId, userId, manager);

      return {
        blockId,
        version: newVer,
        parentId: moveBlockDto.parentId,
        sortKey: moveBlockDto.sortKey,
      };
    });
  }

  /**
   * 删除块
   */
  async remove(blockId: string, userId: string) {
    const block = await this.blockRepository.findOne({
      where: { blockId, isDeleted: false },
    });

    if (!block) {
      throw new NotFoundException('块不存在');
    }

    // 检查文档权限
    await this.documentsService.findOne(block.docId, userId);

    // 使用事务软删除块
    return await this.dataSource.transaction(async (manager) => {
      const now = Date.now();

      // 软删除块
      block.isDeleted = true;
      block.deletedAt = now;
      block.deletedBy = userId;
      await manager.save(Block, block);

      // 更新文档版本号
      await this.incrementDocumentHead(block.docId, userId, manager);

      return { message: '块已删除' };
    });
  }

  /**
   * 获取块版本历史
   */
  async getVersions(blockId: string, paginationDto: PaginationDto, userId: string) {
    const block = await this.blockRepository.findOne({
      where: { blockId },
    });

    if (!block) {
      throw new NotFoundException('块不存在');
    }

    // 检查文档权限
    await this.documentsService.findOne(block.docId, userId);

    const { page = 1, pageSize = 20 } = paginationDto;
    const skip = (page - 1) * pageSize;

    const [versions, total] = await this.blockVersionRepository.findAndCount({
      where: { blockId },
      order: { ver: 'DESC' },
      skip,
      take: pageSize,
    });

    return {
      items: versions,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 检查移动操作是否会导致循环引用
   */
  private async wouldCreateCycle(blockId: string, newParentId: string): Promise<boolean> {
    let currentParentId = newParentId;
    const visited = new Set<string>([blockId]);

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        return true; // 发现循环
      }
      visited.add(currentParentId);

      const parent = await this.blockRepository.findOne({
        where: { blockId: currentParentId, isDeleted: false },
      });

      if (!parent) {
        break;
      }

      // 获取父块的父块ID
      const parentVersion = await this.blockVersionRepository.findOne({
        where: { blockId: currentParentId, ver: parent.latestVer },
      });

      if (!parentVersion || !parentVersion.parentId) {
        break;
      }
      currentParentId = parentVersion.parentId;
    }

    return false;
  }

  /**
   * 批量操作块
   */
  async batch(batchBlockDto: BatchBlockDto, userId: string) {
    // 检查文档权限
    await this.documentsService.findOne(batchBlockDto.docId, userId);

    // 使用事务执行批量操作
    return await this.dataSource.transaction(async (manager) => {
      const results: Array<{
        success: boolean;
        operation: string;
        blockId?: string;
        version?: number;
        error?: string;
      }> = [];
      const now = Date.now();

      for (const operation of batchBlockDto.operations) {
        try {
          if (operation.type === 'create') {
            const result = await this.handleBatchCreate(operation, batchBlockDto.docId, userId, now, manager);
            results.push({ success: true, operation: 'create', ...result });
          } else if (operation.type === 'update') {
            const result = await this.handleBatchUpdate(operation, userId, now, manager);
            results.push({ success: true, operation: 'update', ...result });
          } else if (operation.type === 'delete') {
            const result = await this.handleBatchDelete(operation, userId, now, manager);
            results.push({ success: true, operation: 'delete', ...result });
          } else if (operation.type === 'move') {
            const result = await this.handleBatchMove(operation, userId, now, manager);
            results.push({ success: true, operation: 'move', ...result });
          }
        } catch (error) {
          results.push({
            success: false,
            operation: operation.type,
            error: error.message,
          });
        }
      }

      // 更新文档版本号
      await this.incrementDocumentHead(batchBlockDto.docId, userId, manager);

      return {
        total: batchBlockDto.operations.length,
        success: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    });
  }

  /**
   * 处理批量创建操作
   */
  private async handleBatchCreate(
    operation: any,
    docId: string,
    userId: string,
    now: number,
    manager: any,
  ) {
    const blockId = generateBlockId();
    const sortKey = operation.data.sortKey || this.generateSortKey(operation.data.parentId);

    const block = manager.create(Block, {
      blockId,
      docId,
      type: operation.data.type,
      createdAt: now,
      createdBy: userId,
      latestVer: 1,
      latestAt: now,
      latestBy: userId,
      isDeleted: false,
    });

    await manager.save(Block, block);

    const hash = this.calculateHash(operation.data.payload);
    const blockVersion = manager.create(BlockVersion, {
      versionId: generateVersionId(blockId, 1),
      docId,
      blockId,
      ver: 1,
      createdAt: now,
      createdBy: userId,
      parentId: operation.data.parentId || '',
      sortKey,
      indent: operation.data.indent || 0,
      collapsed: operation.data.collapsed || false,
      payload: operation.data.payload,
      hash,
      plainText: this.extractPlainText(operation.data.payload),
      refs: [],
    });

    await manager.save(BlockVersion, blockVersion);

    return { blockId };
  }

  /**
   * 处理批量更新操作
   */
  private async handleBatchUpdate(operation: any, userId: string, now: number, manager: any) {
    const block = await manager.findOne(Block, {
      where: { blockId: operation.blockId, isDeleted: false },
    });

    if (!block) {
      throw new NotFoundException(`块 ${operation.blockId} 不存在`);
    }

    const newVer = block.latestVer + 1;
    const hash = this.calculateHash(operation.data.payload);

    const latestVersion = await manager.findOne(BlockVersion, {
      where: { blockId: operation.blockId, ver: block.latestVer },
    });

    const blockVersion = manager.create(BlockVersion, {
      versionId: generateVersionId(operation.blockId, newVer),
      docId: block.docId,
      blockId: operation.blockId,
      ver: newVer,
      createdAt: now,
      createdBy: userId,
      parentId: latestVersion?.parentId || '',
      sortKey: latestVersion?.sortKey || '0',
      indent: latestVersion?.indent || 0,
      collapsed: latestVersion?.collapsed || false,
      payload: operation.data.payload,
      hash,
      plainText: operation.data.plainText || this.extractPlainText(operation.data.payload),
      refs: [],
    });

    await manager.save(BlockVersion, blockVersion);

    block.latestVer = newVer;
    block.latestAt = now;
    block.latestBy = userId;
    await manager.save(Block, block);

    return { blockId: operation.blockId, version: newVer };
  }

  /**
   * 处理批量删除操作
   */
  private async handleBatchDelete(operation: any, userId: string, now: number, manager: any) {
    const block = await manager.findOne(Block, {
      where: { blockId: operation.blockId, isDeleted: false },
    });

    if (!block) {
      throw new NotFoundException(`块 ${operation.blockId} 不存在`);
    }

    block.isDeleted = true;
    block.deletedAt = now;
    block.deletedBy = userId;
    await manager.save(Block, block);

    return { blockId: operation.blockId };
  }

  /**
   * 处理批量移动操作
   */
  private async handleBatchMove(operation: any, userId: string, now: number, manager: any) {
    const block = await manager.findOne(Block, {
      where: { blockId: operation.blockId, isDeleted: false },
    });

    if (!block) {
      throw new NotFoundException(`块 ${operation.blockId} 不存在`);
    }

    const latestVersion = await manager.findOne(BlockVersion, {
      where: { blockId: operation.blockId, ver: block.latestVer },
    });

    if (!latestVersion) {
      throw new NotFoundException(`块版本不存在`);
    }

    const newVer = block.latestVer + 1;
    const blockVersion = manager.create(BlockVersion, {
      versionId: generateVersionId(operation.blockId, newVer),
      docId: block.docId,
      blockId: operation.blockId,
      ver: newVer,
      createdAt: now,
      createdBy: userId,
      parentId: operation.parentId || '',
      sortKey: operation.sortKey,
      indent: operation.indent || 0,
      collapsed: latestVersion.collapsed,
      payload: latestVersion.payload,
      hash: latestVersion.hash,
      plainText: latestVersion.plainText,
      refs: latestVersion.refs,
    });

    await manager.save(BlockVersion, blockVersion);

    block.latestVer = newVer;
    block.latestAt = now;
    block.latestBy = userId;
    await manager.save(Block, block);

    return { blockId: operation.blockId, version: newVer };
  }
}
