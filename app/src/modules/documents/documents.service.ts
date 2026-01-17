import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Document } from '../../entities/document.entity';
import { Block } from '../../entities/block.entity';
import { BlockVersion } from '../../entities/block-version.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { generateDocId, generateBlockId, generateVersionId } from '../../common/utils/id-generator.util';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { MoveDocumentDto } from './dto/move-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    @InjectRepository(Block)
    private blockRepository: Repository<Block>,
    @InjectRepository(BlockVersion)
    private blockVersionRepository: Repository<BlockVersion>,
    @InjectDataSource()
    private dataSource: DataSource,
    private workspacesService: WorkspacesService,
  ) {}

  /**
   * 创建文档
   */
  async create(createDocumentDto: CreateDocumentDto, userId: string) {
    // 检查工作空间权限
    await this.workspacesService.checkAccess(createDocumentDto.workspaceId, userId);

    // 如果指定了父文档，验证父文档存在且在同一工作空间
    // 只有当 parentId 是有效的非空字符串时才检查
    if (createDocumentDto.parentId && typeof createDocumentDto.parentId === 'string' && createDocumentDto.parentId.trim() !== '') {
      const parentDoc = await this.documentRepository.findOne({
        where: { docId: createDocumentDto.parentId },
      });
      if (!parentDoc) {
        throw new NotFoundException('父文档不存在');
      }
      if (parentDoc.workspaceId !== createDocumentDto.workspaceId) {
        throw new BadRequestException('父文档必须属于同一工作空间');
      } 
    }

    // 使用事务创建文档和根块
    return await this.dataSource.transaction(async (manager) => {
      const now = Date.now();
      const docId = generateDocId();
      const rootBlockId = generateBlockId();

      // 创建文档
      const document = manager.create(Document, {
        docId,
        workspaceId: createDocumentDto.workspaceId,
        title: createDocumentDto.title,
        icon: createDocumentDto.icon,
        cover: createDocumentDto.cover,
        visibility: createDocumentDto.visibility || 'private',
        parentId: createDocumentDto.parentId,
        tags: createDocumentDto.tags || [],
        category: createDocumentDto.category,
        rootBlockId,
        head: 1,
        publishedHead: 0,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
        viewCount: 0,
        favoriteCount: 0,
        sortOrder: 0,
      });

      const savedDocument = await manager.save(Document, document);

      // 创建根块
      const rootBlock = manager.create(Block, {
        blockId: rootBlockId,
        docId,
        type: 'root',
        createdAt: now,
        createdBy: userId,
        latestVer: 1,
        latestAt: now,
        latestBy: userId,
        isDeleted: false,
      });

      await manager.save(Block, rootBlock);

      // 创建根块的初始版本
      const rootBlockVersion = manager.create(BlockVersion, {
        versionId: generateVersionId(rootBlockId, 1),
        docId,
        blockId: rootBlockId,
        ver: 1,
        createdAt: now,
        createdBy: userId,
        parentId: '',
        sortKey: '0',
        indent: 0,
        collapsed: false,
        payload: { type: 'root', children: [] },
        hash: this.calculateHash({ type: 'root', children: [] }),
        plainText: '',
        refs: [],
      });

      await manager.save(BlockVersion, rootBlockVersion);

      // 在事务内查询完整文档信息
      const savedDocumentWithDetails = await manager.findOne(Document, {
        where: { docId },
      });

      if (!savedDocumentWithDetails) {
        throw new NotFoundException('文档不存在');
      }

      // 注意：在事务内不增加浏览次数，避免副作用
      // 返回创建的文档信息
      return savedDocumentWithDetails;
    });
  }

  /**
   * 获取文档列表
   */
  async findAll(queryDto: QueryDocumentsDto, userId: string) {
    const { page = 1, pageSize = 20, workspaceId, status, visibility, parentId, tags, category, sortBy = 'updatedAt', sortOrder = 'DESC' } = queryDto;
    const skip = (page - 1) * pageSize;

    // 如果指定了工作空间，检查权限
    if (workspaceId) {
      await this.workspacesService.checkAccess(workspaceId, userId);
    }

    // 构建查询
    const queryBuilder = this.documentRepository.createQueryBuilder('document');

    // 工作空间过滤
    if (workspaceId) {
      queryBuilder.andWhere('document.workspaceId = :workspaceId', { workspaceId });
    } else {
      // 如果没有指定工作空间，查询用户有权限的所有工作空间的文档
      const userWorkspaces = await this.getUserWorkspaceIds(userId);
      if (userWorkspaces.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      queryBuilder.andWhere('document.workspaceId IN (:...workspaceIds)', {
        workspaceIds: userWorkspaces,
      });
    }

    // 状态过滤
    if (status) {
      queryBuilder.andWhere('document.status = :status', { status });
    } else {
      // 默认不显示已删除的文档
      queryBuilder.andWhere('document.status != :deleted', { deleted: 'deleted' });
    }

    // 可见性过滤
    if (visibility) {
      queryBuilder.andWhere('document.visibility = :visibility', { visibility });
    }

    // 父文档过滤
    if (parentId !== undefined) {
      if (parentId === null) {
        queryBuilder.andWhere('document.parentId IS NULL');
      } else {
        queryBuilder.andWhere('document.parentId = :parentId', { parentId });
      }
    }

    // 标签过滤
    if (tags && tags.length > 0) {
      queryBuilder.andWhere('document.tags && :tags', { tags });
    }

    // 分类过滤
    if (category) {
      queryBuilder.andWhere('document.category = :category', { category });
    }

    // 排序
    queryBuilder.orderBy(`document.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    // 分页
    queryBuilder.skip(skip).take(pageSize);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 获取文档详情
   */
  async findOne(docId: string, userId: string) {
    const document = await this.documentRepository.findOne({
      where: { docId },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    // 检查权限
    await this.checkDocumentAccess(document, userId);

    // 增加浏览次数
    document.viewCount += 1;
    await this.documentRepository.save(document);

    return document;
  }

  /**
   * 获取用户有权限的工作空间ID列表
   */
  private async getUserWorkspaceIds(userId: string): Promise<string[]> {
    // 这里可以优化，使用工作空间服务的方法
    const workspaces = await this.workspacesService.findAll(userId, { page: 1, pageSize: 1000 });
    return workspaces.items.map((ws: any) => ws.workspaceId);
  }

  /**
   * 检查文档访问权限
   */
  private async checkDocumentAccess(document: Document, userId: string): Promise<void> {
    // 检查工作空间权限
    await this.workspacesService.checkAccess(document.workspaceId, userId);

    // 检查文档可见性
    if (document.visibility === 'private') {
      // 私有文档：只有创建者可以访问
      if (document.createdBy !== userId) {
        throw new ForbiddenException('您没有权限访问此文档');
      }
    } else if (document.visibility === 'workspace') {
      // 工作空间可见：工作空间成员可以访问（已在上面检查）
      // 无需额外检查
    }
    // public 文档：任何人都可以访问（如果工作空间允许）
  }

  /**
   * 更新文档元数据
   */
  async update(docId: string, updateDocumentDto: UpdateDocumentDto, userId: string) {
    const document = await this.documentRepository.findOne({
      where: { docId },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    // 检查编辑权限
    await this.checkDocumentEditPermission(document, userId);

    // 更新字段
    if (updateDocumentDto.title !== undefined) {
      document.title = updateDocumentDto.title;
    }
    if (updateDocumentDto.icon !== undefined) {
      document.icon = updateDocumentDto.icon;
    }
    if (updateDocumentDto.cover !== undefined) {
      document.cover = updateDocumentDto.cover;
    }
    if (updateDocumentDto.visibility !== undefined) {
      document.visibility = updateDocumentDto.visibility;
    }
    if (updateDocumentDto.tags !== undefined) {
      document.tags = updateDocumentDto.tags;
    }
    if (updateDocumentDto.category !== undefined) {
      document.category = updateDocumentDto.category;
    }
    if (updateDocumentDto.status !== undefined) {
      document.status = updateDocumentDto.status;
    }

    document.updatedBy = userId;
    await this.documentRepository.save(document);

    return this.findOne(docId, userId);
  }

  /**
   * 发布文档
   */
  async publish(docId: string, userId: string) {
    const document = await this.documentRepository.findOne({
      where: { docId },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    // 检查编辑权限
    await this.checkDocumentEditPermission(document, userId);

    // 更新已发布版本号
    document.publishedHead = document.head;
    document.updatedBy = userId;
    await this.documentRepository.save(document);

    return this.findOne(docId, userId);
  }

  /**
   * 移动文档
   */
  async move(docId: string, moveDocumentDto: MoveDocumentDto, userId: string) {
    const document = await this.documentRepository.findOne({
      where: { docId },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    // 检查编辑权限
    await this.checkDocumentEditPermission(document, userId);

    // 如果指定了新的父文档，验证父文档
    if (moveDocumentDto.parentId !== undefined) {
      if (moveDocumentDto.parentId === null) {
        // 移动到根目录
        (document as any).parentId = null;
      } else {
        // 验证父文档存在且在同一工作空间
        const parentDoc = await this.documentRepository.findOne({
          where: { docId: moveDocumentDto.parentId },
        });
        if (!parentDoc) {
          throw new NotFoundException('父文档不存在');
        }
        if (parentDoc.workspaceId !== document.workspaceId) {
          throw new BadRequestException('父文档必须属于同一工作空间');
        }
        // 防止循环引用
        if (parentDoc.docId === docId) {
          throw new BadRequestException('不能将文档移动到自身');
        }
        // 检查是否会导致循环引用（简化检查）
        if (await this.wouldCreateCycle(docId, moveDocumentDto.parentId)) {
          throw new BadRequestException('移动操作会导致循环引用');
        }
        document.parentId = moveDocumentDto.parentId;
      }
    }

    // 更新排序
    if (moveDocumentDto.sortOrder !== undefined) {
      document.sortOrder = moveDocumentDto.sortOrder;
    }

    document.updatedBy = userId;
    await this.documentRepository.save(document);

    return this.findOne(docId, userId);
  }

  /**
   * 删除文档
   */
  async remove(docId: string, userId: string) {
    const document = await this.documentRepository.findOne({
      where: { docId },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    // 检查删除权限
    await this.checkDocumentDeletePermission(document, userId);

    // 软删除：更新状态
    document.status = 'deleted';
    document.updatedBy = userId;
    await this.documentRepository.save(document);

    return { message: '文档已删除' };
  }

  /**
   * 检查文档编辑权限
   */
  private async checkDocumentEditPermission(document: Document, userId: string): Promise<void> {
    // 检查工作空间编辑权限
    await this.workspacesService.checkEditPermission(document.workspaceId, userId);
  }

  /**
   * 检查文档删除权限
   */
  private async checkDocumentDeletePermission(document: Document, userId: string): Promise<void> {
    // 检查工作空间管理权限
    await this.workspacesService.checkAdminPermission(document.workspaceId, userId);
  }

  /**
   * 检查移动操作是否会导致循环引用
   */
  private async wouldCreateCycle(docId: string, newParentId: string): Promise<boolean> {
    let currentParentId = newParentId;
    const visited = new Set<string>([docId]);

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        return true; // 发现循环
      }
      visited.add(currentParentId);

      const parent = await this.documentRepository.findOne({
        where: { docId: currentParentId },
        select: ['parentId'],
      });

      if (!parent || !parent.parentId) {
        break;
      }
      currentParentId = parent.parentId;
    }

    return false;
  }

  /**
   * 获取文档内容（渲染树）
   */
  async getContent(docId: string, version: number | undefined, userId: string) {
    const document = await this.findOne(docId, userId);

    // 确定要使用的版本号
    const docVer = version || document.head;

    // 获取根块的版本
    const rootBlockVersion = await this.blockVersionRepository.findOne({
      where: {
        blockId: document.rootBlockId,
        ver: docVer,
      },
    });

    if (!rootBlockVersion) {
      throw new NotFoundException('文档版本不存在');
    }

    // 构建渲染树（简化版，实际应该递归加载所有子块）
    const tree = await this.buildBlockTree(document.rootBlockId, docVer);

    return {
      docId: document.docId,
      docVer,
      title: document.title,
      tree,
    };
  }

  /**
   * 构建块树（简化实现）
   */
  private async buildBlockTree(rootBlockId: string, version: number): Promise<any> {
    // 获取根块版本
    const rootVersion = await this.blockVersionRepository.findOne({
      where: { blockId: rootBlockId, ver: version },
    });

    if (!rootVersion) {
      return null;
    }

    // 简化实现：只返回根块，实际应该递归加载子块
    return {
      blockId: rootBlockId,
      type: rootVersion.payload['type'] || 'root',
      payload: rootVersion.payload,
      children: [], // 实际应该递归加载
    };
  }

  /**
   * 搜索文档
   */
  async search(searchQueryDto: SearchQueryDto, userId: string) {
    const { query, workspaceId, status, tags, page = 1, pageSize = 20 } = searchQueryDto;
    const skip = (page - 1) * pageSize;

    // 如果指定了工作空间，检查权限
    if (workspaceId) {
      await this.workspacesService.checkAccess(workspaceId, userId);
    }

    // 构建查询
    const queryBuilder = this.documentRepository
      .createQueryBuilder('document')
      .where('document.searchVector @@ plainto_tsquery(:query)', { query })
      .orWhere('document.title ILIKE :titleQuery', { titleQuery: `%${query}%` });

    // 工作空间过滤
    if (workspaceId) {
      queryBuilder.andWhere('document.workspaceId = :workspaceId', { workspaceId });
    } else {
      // 查询用户有权限的所有工作空间的文档
      const userWorkspaces = await this.getUserWorkspaceIds(userId);
      if (userWorkspaces.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      queryBuilder.andWhere('document.workspaceId IN (:...workspaceIds)', {
        workspaceIds: userWorkspaces,
      });
    }

    // 状态过滤
    if (status) {
      queryBuilder.andWhere('document.status = :status', { status });
    } else {
      queryBuilder.andWhere('document.status != :deleted', { deleted: 'deleted' });
    }

    // 标签过滤
    if (tags && tags.length > 0) {
      queryBuilder.andWhere('document.tags && :tags', { tags });
    }

    // 排序（按相关性）
    queryBuilder
      .orderBy('ts_rank(document.searchVector, plainto_tsquery(:query))', 'DESC')
      .addOrderBy('document.updatedAt', 'DESC');

    // 分页
    queryBuilder.skip(skip).take(pageSize);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 计算内容的哈希值（简化版）
   */
  private calculateHash(content: any): string {
    // 简化实现，实际应该使用更安全的哈希算法
    const str = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}
