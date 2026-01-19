import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Document } from '../../entities/document.entity';
import { Block } from '../../entities/block.entity';
import { BlockVersion } from '../../entities/block-version.entity';
import { DocRevision } from '../../entities/doc-revision.entity';
import { DocSnapshot } from '../../entities/doc-snapshot.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { VersionControlService } from './services/version-control.service';
import { generateDocId, generateBlockId, generateVersionId } from '../../common/utils/id-generator.util';
import { compareSortKey } from '../../common/utils/sort-key.util';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { MoveDocumentDto } from './dto/move-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { QueryRevisionsDto } from './dto/query-revisions.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { ActivitiesService } from '../activities/activities.service';
import { DOC_ACTIONS } from '../activities/constants/activity-actions';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    private versionControlService: VersionControlService,
    @InjectRepository(Block)
    private blockRepository: Repository<Block>,
    @InjectRepository(BlockVersion)
    private blockVersionRepository: Repository<BlockVersion>,
    @InjectRepository(DocRevision)
    private docRevisionRepository: Repository<DocRevision>,
    @InjectRepository(DocSnapshot)
    private docSnapshotRepository: Repository<DocSnapshot>,
    @InjectDataSource()
    private dataSource: DataSource,
    private workspacesService: WorkspacesService,
    private activitiesService: ActivitiesService,
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
      // 不能使用已删除的文档作为父文档
      if (parentDoc.status === 'deleted') {
        throw new NotFoundException('父文档不存在');
      }
      if (parentDoc.workspaceId !== createDocumentDto.workspaceId) {
        throw new BadRequestException('父文档必须属于同一工作空间');
      } 
    }

    // 使用事务创建文档和根块
    const result = await this.dataSource.transaction(async (manager) => {
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

      // 创建初始修订记录 (head=1)
      const docRevisionRepo = manager.getRepository(DocRevision);
      const initialRevision = docRevisionRepo.create({
        revisionId: `${docId}@1`,
        docId,
        docVer: 1,
        createdAt: now,
        createdBy: userId,
        message: 'Initial version',
        branch: 'draft',
        patches: [],
        rootBlockId,
        source: 'api',
        opSummary: {},
      });
      await docRevisionRepo.save(initialRevision);

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
    await this.activitiesService.record(
      result.workspaceId,
      DOC_ACTIONS.CREATE,
      'document',
      result.docId,
      userId,
      { title: result.title },
    );
    return result;
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

    // 已删除的文档不应该返回
    if (document.status === 'deleted') {
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

    // 已删除的文档不能更新
    if (document.status === 'deleted') {
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
    await this.activitiesService.record(
      document.workspaceId,
      DOC_ACTIONS.UPDATE,
      'document',
      docId,
      userId,
      updateDocumentDto as object,
    );
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

    // 已删除的文档不能发布
    if (document.status === 'deleted') {
      throw new NotFoundException('文档不存在');
    }

    // 检查编辑权限
    await this.checkDocumentEditPermission(document, userId);

    // 更新已发布版本号
    document.publishedHead = document.head;
    document.updatedBy = userId;
    await this.documentRepository.save(document);
    await this.activitiesService.record(
      document.workspaceId,
      DOC_ACTIONS.PUBLISH,
      'document',
      docId,
      userId,
    );
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

    // 已删除的文档不能移动
    if (document.status === 'deleted') {
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
        // 不能使用已删除的文档作为父文档
        if (parentDoc.status === 'deleted') {
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
    await this.activitiesService.record(
      document.workspaceId,
      DOC_ACTIONS.MOVE,
      'document',
      docId,
      userId,
      moveDocumentDto as object,
    );
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
    await this.activitiesService.record(
      document.workspaceId,
      DOC_ACTIONS.DELETE,
      'document',
      docId,
      userId,
    );
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
        select: ['parentId', 'status'],
      });

      // 如果父文档不存在或已删除，停止检查
      if (!parent || parent.status === 'deleted' || !parent.parentId) {
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

    // 检查文档版本是否存在
    const revision = await this.docRevisionRepository.findOne({
      where: { docId, docVer },
    });

    if (!revision) {
      throw new NotFoundException('文档版本不存在');
    }

    // 获取该文档版本对应的块版本映射
    const blockVersionMap = await this.getBlockVersionMapForVersion(docId, docVer);

    // 调试信息
    console.log('getContent - docId:', docId, 'docVer:', docVer);
    console.log('getContent - rootBlockId:', document.rootBlockId);
    console.log('getContent - blockVersionMap keys:', Object.keys(blockVersionMap));
    console.log('getContent - rootBlockId in map:', document.rootBlockId in blockVersionMap);

    // 根据块版本映射构建完整的内容树
    const tree = await this.buildContentTreeFromVersionMap(
      docId,
      document.rootBlockId,
      blockVersionMap,
    );

    if (!tree) {
      console.error('buildContentTreeFromVersionMap returned null');
      console.error('blockVersionMap:', blockVersionMap);
      throw new NotFoundException('文档版本不存在');
    }

    // 检查根块是否被删除
    if (tree && typeof tree === 'object' && '__rootBlockDeleted' in tree) {
      throw new BadRequestException('根块已被删除，无法获取文档内容。请恢复根块或重新创建文档。');
    }

    // 检查根块是否不存在
    if (tree && typeof tree === 'object' && '__rootBlockMissing' in tree) {
      throw new NotFoundException('根块不存在，无法获取文档内容。');
    }

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
   * 获取文档修订历史
   */
  async getRevisions(docId: string, queryDto: QueryRevisionsDto, userId: string) {
    const document = await this.findOne(docId, userId);
    await this.checkDocumentEditPermission(document, userId);

    const { page = 1, pageSize = 20 } = queryDto;
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.docRevisionRepository.findAndCount({
      where: { docId },
      order: { docVer: 'DESC' },
      skip,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  /**
   * 版本对比：返回两个版本之间的内容差异
   */
  async getDiff(docId: string, fromVer: number, toVer: number, userId: string) {
    const document = await this.findOne(docId, userId);
    await this.checkDocumentEditPermission(document, userId);

    if (fromVer > toVer) {
      throw new BadRequestException('fromVer 不能大于 toVer');
    }
    if (fromVer > document.head || toVer > document.head) {
      throw new BadRequestException('版本号不能超过当前文档 head');
    }

    const [fromMap, toMap] = await Promise.all([
      this.getBlockVersionMapForVersion(docId, fromVer),
      this.getBlockVersionMapForVersion(docId, toVer),
    ]);

    const [fromTree, toTree] = await Promise.all([
      this.buildContentTreeFromVersionMap(docId, document.rootBlockId, fromMap),
      this.buildContentTreeFromVersionMap(docId, document.rootBlockId, toMap),
    ]);

    return {
      docId,
      fromVer,
      toVer,
      fromContent: fromTree,
      toContent: toTree,
    };
  }

  /**
   * 回滚文档到指定版本
   */
  async revert(docId: string, version: number, userId: string) {
    const document = await this.findOne(docId, userId);
    await this.checkDocumentEditPermission(document, userId);

    if (version > document.head) {
      throw new BadRequestException('版本号不能超过当前文档 head');
    }
    if (version === document.head) {
      throw new BadRequestException('当前已是该版本，无需回滚');
    }

    const blockVersionMap = await this.getBlockVersionMapForVersion(docId, version);
    const revision = await this.docRevisionRepository.findOne({
      where: { docId, docVer: version },
    });
    if (!revision) {
      throw new NotFoundException('修订版本不存在');
    }

    return await this.dataSource.transaction(async (manager) => {
      const docRepo = manager.getRepository(Document);
      const blockRepo = manager.getRepository(Block);
      const revRepo = manager.getRepository(DocRevision);

      const doc = await docRepo.findOne({ where: { docId } });
      if (!doc) throw new NotFoundException('文档不存在');

      const allBlocks = await blockRepo.find({ where: { docId } });
      const targetBlockIds = new Set(Object.keys(blockVersionMap));

      for (const block of allBlocks) {
        if (targetBlockIds.has(block.blockId)) {
          block.latestVer = blockVersionMap[block.blockId];
          block.isDeleted = false;
          (block as any).deletedAt = null;
          (block as any).deletedBy = null;
        } else {
          block.isDeleted = true;
          block.deletedAt = Date.now();
          block.deletedBy = userId;
        }
        await blockRepo.save(block);
      }

      doc.head += 1;
      doc.updatedBy = userId;
      await docRepo.save(doc);

      const newRevision = revRepo.create({
        revisionId: `${docId}@${doc.head}`,
        docId,
        docVer: doc.head,
        createdAt: Date.now(),
        createdBy: userId,
        message: `Revert to version ${version}`,
        branch: 'draft',
        patches: [],
        rootBlockId: doc.rootBlockId,
        source: 'api',
        opSummary: { revertedFrom: version },
      });
      await revRepo.save(newRevision);

      return this.findOne(docId, userId);
    });
  }

  /**
   * 创建文档快照（保存当前版本的完整块版本映射）
   */
  async createSnapshot(docId: string, userId: string) {
    const document = await this.findOne(docId, userId);
    await this.checkDocumentEditPermission(document, userId);

    const existing = await this.docSnapshotRepository.findOne({
      where: { docId, docVer: document.head },
    });
    if (existing) {
      return existing;
    }

    const blocks = await this.blockRepository.find({
      where: { docId, isDeleted: false },
      select: ['blockId', 'latestVer'],
    });
    const blockVersionMap: Record<string, number> = {};
    for (const b of blocks) {
      blockVersionMap[b.blockId] = b.latestVer;
    }

    const snapshot = this.docSnapshotRepository.create({
      snapshotId: `${docId}@snap@${document.head}`,
      docId,
      docVer: document.head,
      createdAt: Date.now(),
      rootBlockId: document.rootBlockId,
      blockVersionMap,
    });
    return await this.docSnapshotRepository.save(snapshot);
  }

  /**
   * 手动触发创建文档版本（提交待创建的版本）
   */
  async commitVersion(docId: string, message: string | undefined, userId: string) {
    const document = await this.findOne(docId, userId);
    await this.checkDocumentEditPermission(document, userId);

    // 获取待创建版本的数量
    const pendingCount = this.versionControlService.getPendingVersionCount(docId);

    if (pendingCount === 0) {
      throw new BadRequestException('没有待创建的版本，无需提交');
    }

    // 创建版本
    const newVersion = await this.versionControlService.createVersion(
      docId,
      userId,
      message,
    );

    return {
      docId,
      version: newVersion,
      pendingOperations: pendingCount,
      message: message || `提交 ${pendingCount} 个待处理操作`,
    };
  }

  /**
   * 获取文档待创建版本的数量
   */
  async getPendingVersions(docId: string, userId: string) {
    const document = await this.findOne(docId, userId);
    const pendingCount = this.versionControlService.getPendingVersionCount(docId);

    return {
      docId,
      pendingCount,
      hasPending: pendingCount > 0,
    };
  }

  /**
   * 根据 DocRevision 的 createdAt 计算某文档版本对应的块版本映射
   */
  private async getBlockVersionMapForVersion(
    docId: string,
    docVer: number,
  ): Promise<Record<string, number>> {
    const revision = await this.docRevisionRepository.findOne({
      where: { docId, docVer },
    });
    if (!revision) {
      throw new NotFoundException(`修订版本 ${docVer} 不存在`);
    }

    // 获取文档信息，包含根块ID
    const document = await this.documentRepository.findOne({
      where: { docId },
      select: ['rootBlockId'],
    });
    if (!document) {
      throw new NotFoundException(`文档 ${docId} 不存在`);
    }

    // 查询块版本映射，排除已删除的块
    const rows = await this.blockVersionRepository
      .createQueryBuilder('bv')
      .innerJoin(Block, 'b', 'bv.blockId = b.blockId AND b.isDeleted = false')
      .select('bv.blockId', 'blockId')
      .addSelect('MAX(bv.ver)', 'maxVer')
      .where('bv.docId = :docId', { docId })
      .andWhere('bv.createdAt <= :createdAt', { createdAt: revision.createdAt })
      .groupBy('bv.blockId')
      .getRawMany();

    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.blockId] = typeof r.maxVer === 'string' ? parseInt(r.maxVer, 10) : r.maxVer;
    }

    // 确保根块在版本映射中（根块不应该被删除）
    if (document.rootBlockId && !(document.rootBlockId in map)) {
      console.log('根块不在版本映射中，尝试添加，rootBlockId:', document.rootBlockId);
      
      // 查询根块的最新版本
      const rootBlock = await this.blockRepository.findOne({
        where: { docId, blockId: document.rootBlockId },
      });
      
      console.log('根块查询结果:', rootBlock ? { blockId: rootBlock.blockId, isDeleted: rootBlock.isDeleted, latestVer: rootBlock.latestVer } : 'null');
      
      if (rootBlock && !rootBlock.isDeleted) {
        // 查找根块在该时间点之前的版本
        const rootVersion = await this.blockVersionRepository
          .createQueryBuilder('bv')
          .where('bv.docId = :docId', { docId })
          .andWhere('bv.blockId = :blockId', { blockId: document.rootBlockId })
          .andWhere('bv.createdAt <= :createdAt', { createdAt: revision.createdAt })
          .orderBy('bv.ver', 'DESC')
          .limit(1)
          .getOne();
        
        console.log('根块版本查询结果:', rootVersion ? { blockId: rootVersion.blockId, ver: rootVersion.ver, createdAt: rootVersion.createdAt } : 'null');
        console.log('revision.createdAt:', revision.createdAt);
        
        if (rootVersion) {
          map[document.rootBlockId] = rootVersion.ver;
          console.log('已添加根块到版本映射:', document.rootBlockId, 'ver:', rootVersion.ver);
        } else {
          // 如果根块没有版本记录，使用 latestVer（这种情况不应该发生，但作为后备）
          map[document.rootBlockId] = rootBlock.latestVer;
          console.log('根块没有版本记录，使用 latestVer:', rootBlock.latestVer);
        }
      } else {
        console.error('根块不存在或已被删除');
      }
    } else {
      console.log('根块已在版本映射中:', document.rootBlockId in map);
    }

    return map;
  }

  /**
   * 根据块版本映射构建内容树
   */
  private async buildContentTreeFromVersionMap(
    docId: string,
    rootBlockId: string,
    blockVersionMap: Record<string, number>,
  ): Promise<any> {
    if (!(rootBlockId in blockVersionMap)) {
      // 检查根块是否存在以及是否被删除
      const rootBlock = await this.blockRepository.findOne({
        where: { docId, blockId: rootBlockId },
      });
      if (!rootBlock) {
        return { __rootBlockMissing: true };
      }
      if (rootBlock.isDeleted) {
        return { __rootBlockDeleted: true };
      }
      // 根块存在但不在版本映射中，返回 null（这种情况不应该发生）
      return null;
    }

    const entries = Object.entries(blockVersionMap).map(([blockId, ver]) => ({
      blockId,
      ver,
    }));
    if (entries.length === 0) return null;

    // 查询块版本，同时过滤已删除的块
    // 先单独检查根块（根块不应该被删除）
    const rootBlock = await this.blockRepository.findOne({
      where: { docId, blockId: rootBlockId },
    });
    
    if (!rootBlock) {
      console.error('根块不存在，rootBlockId:', rootBlockId);
      return { __rootBlockMissing: true };
    }
    
    if (rootBlock.isDeleted) {
      console.error('根块已被删除，rootBlockId:', rootBlockId);
      return { __rootBlockDeleted: true };
    }
    
    // 查询非根块的有效块ID列表
    const nonRootEntries = entries.filter((e) => e.blockId !== rootBlockId);
    const nonRootBlockIds = nonRootEntries.map((e) => e.blockId);
    
    let validBlockIds = new Set<string>([rootBlockId]); // 根块始终有效
    
    if (nonRootBlockIds.length > 0) {
      const validBlocks = await this.blockRepository.find({
        where: {
          docId,
          isDeleted: false,
          blockId: In(nonRootBlockIds) as any,
        },
        select: ['blockId'],
      });
      for (const b of validBlocks) {
        validBlockIds.add(b.blockId);
      }
    }

    // 只查询有效块的版本（包括根块）
    const validEntries = entries.filter((e) => validBlockIds.has(e.blockId));
    
    // 确保根块在查询列表中
    if (!validEntries.find((e) => e.blockId === rootBlockId)) {
      const rootVer = blockVersionMap[rootBlockId];
      if (rootVer) {
        validEntries.unshift({ blockId: rootBlockId, ver: rootVer });
      }
    }
    
    if (validEntries.length === 0) {
      console.error('validEntries 为空，但根块应该存在');
      return null;
    }

    const versions = await this.blockVersionRepository.find({
      where: validEntries.map((e) => ({ docId, blockId: e.blockId, ver: e.ver })),
    });

    const byBlock = new Map<string, typeof versions[0]>();
    for (const v of versions) byBlock.set(v.blockId, v);

    const root = byBlock.get(rootBlockId);
    if (!root) return null;

    const buildNode = (blockId: string): any => {
      const bv = byBlock.get(blockId);
      if (!bv) return null;
      
      // 获取所有子块并排序
      // 注意：这里使用 versions 数组，它包含了 blockVersionMap 中指定的所有版本
      const childVersions = versions
        .filter((v) => v.parentId === blockId)
        .sort((a, b) => {
          // 确保 sortKey 不为空，使用数字比较
          // 如果 sortKey 为空或无效，使用默认值 '500000'（中间值）
          const sortKeyA = (a.sortKey && a.sortKey.trim() !== '') ? a.sortKey : '500000';
          const sortKeyB = (b.sortKey && b.sortKey.trim() !== '') ? b.sortKey : '500000';
          const result = compareSortKey(sortKeyA, sortKeyB);
          
          // 如果 sortKey 相同，按 blockId 排序（确保稳定性）
          if (result === 0) {
            return a.blockId.localeCompare(b.blockId);
          }
          
          return result;
        });
      
      const children = childVersions
        .map((v) => buildNode(v.blockId))
        .filter(Boolean);
        
      return {
        blockId: bv.blockId,
        type: (bv.payload as any)?.type || 'paragraph',
        payload: bv.payload,
        parentId: bv.parentId,
        sortKey: bv.sortKey || '500000',
        indent: bv.indent || 0,
        collapsed: bv.collapsed || false,
        children,
      };
    };

    return buildNode(rootBlockId);
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
