import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../../entities/tag.entity';
import { Document } from '../../entities/document.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { generateTagId } from '../../common/utils/id-generator.util';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { QueryTagsDto } from './dto/query-tags.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    private workspacesService: WorkspacesService,
  ) {}

  async create(createTagDto: CreateTagDto, userId: string) {
    await this.workspacesService.checkAccess(createTagDto.workspaceId, userId);

    const existing = await this.tagRepository.findOne({
      where: { workspaceId: createTagDto.workspaceId, name: createTagDto.name.trim() },
    });
    if (existing) {
      throw new ConflictException('该工作空间下已存在同名标签');
    }

    const tag = this.tagRepository.create({
      tagId: generateTagId(),
      workspaceId: createTagDto.workspaceId,
      name: createTagDto.name.trim(),
      color: createTagDto.color?.trim(),
      createdBy: userId,
      usageCount: 0,
    });
    return await this.tagRepository.save(tag);
  }

  async findAll(queryDto: QueryTagsDto, userId: string) {
    const { workspaceId, page = 1, pageSize = 20 } = queryDto;
    if (!workspaceId) {
      throw new BadRequestException('workspaceId 为必填');
    }
    await this.workspacesService.checkAccess(workspaceId, userId);

    const skip = (page - 1) * pageSize;
    const [items, total] = await this.tagRepository.findAndCount({
      where: { workspaceId },
      order: { name: 'ASC' },
      skip,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async findOne(tagId: string, userId: string) {
    const tag = await this.tagRepository.findOne({ where: { tagId } });
    if (!tag) throw new NotFoundException('标签不存在');
    await this.workspacesService.checkAccess(tag.workspaceId, userId);
    return tag;
  }

  /** 统计标签被多少文档使用（未删除且 tags 数组包含该标签名） */
  async getUsage(tagId: string, userId: string) {
    const tag = await this.findOne(tagId, userId);
    const r = await this.documentRepository.query(
      `SELECT COUNT(*)::int AS c FROM documents WHERE workspace_id = $1 AND tags @> $2 AND status != $3`,
      [tag.workspaceId, [tag.name], 'deleted'],
    );
    const usage = r?.[0]?.c ?? 0;
    return { tagId: tag.tagId, name: tag.name, usage };
  }

  async update(tagId: string, updateTagDto: UpdateTagDto, userId: string) {
    const tag = await this.findOne(tagId, userId);

    if (updateTagDto.name !== undefined && updateTagDto.name.trim() !== tag.name) {
      const newName = updateTagDto.name.trim();
      const existing = await this.tagRepository.findOne({
        where: { workspaceId: tag.workspaceId, name: newName },
      });
      if (existing) throw new ConflictException('该工作空间下已存在同名标签');
      // 同步 documents.tags：将标签名从旧改为新
      await this.documentRepository.query(
        `UPDATE documents SET tags = array_replace(tags, $1::text, $2::text) WHERE workspace_id = $3 AND tags @> $4`,
        [tag.name, newName, tag.workspaceId, [tag.name]],
      );
      tag.name = newName;
    }
    if (updateTagDto.color !== undefined) {
      const v = updateTagDto.color.trim();
      (tag as { color: string | null }).color = v || null;
    }

    return await this.tagRepository.save(tag);
  }

  async remove(tagId: string, userId: string) {
    const tag = await this.findOne(tagId, userId);

    // 从所有文档的 tags 数组中移除该标签名
    await this.documentRepository.query(
      `UPDATE documents SET tags = array_remove(tags, $1::text) WHERE workspace_id = $2 AND tags @> $3`,
      [tag.name, tag.workspaceId, [tag.name]],
    );

    await this.tagRepository.remove(tag);
    return { message: '标签已删除' };
  }
}
