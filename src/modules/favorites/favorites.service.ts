import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { Document } from '../../entities/document.entity';
import { DocumentsService } from '../documents/documents.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { QueryFavoritesDto } from './dto/query-favorites.dto';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private favoriteRepository: Repository<Favorite>,
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    private documentsService: DocumentsService,
  ) {}

  /** 收藏文档 */
  async create(dto: CreateFavoriteDto, userId: string) {
    await this.documentsService.findOne(dto.docId, userId);

    const existing = await this.favoriteRepository.findOne({
      where: { userId, docId: dto.docId },
    });
    if (existing) {
      throw new ConflictException('已经收藏过该文档');
    }

    await this.favoriteRepository.save(
      this.favoriteRepository.create({ userId, docId: dto.docId }),
    );

    const doc = await this.documentRepository.findOne({ where: { docId: dto.docId } });
    if (doc) {
      doc.favoriteCount = (doc.favoriteCount || 0) + 1;
      await this.documentRepository.save(doc);
    }

    return { message: '收藏成功', docId: dto.docId };
  }

  /** 取消收藏 */
  async remove(docId: string, userId: string) {
    const fav = await this.favoriteRepository.findOne({
      where: { userId, docId },
    });
    if (!fav) throw new NotFoundException('未收藏该文档');

    await this.favoriteRepository.remove(fav);

    const doc = await this.documentRepository.findOne({ where: { docId } });
    if (doc) {
      doc.favoriteCount = Math.max(0, (doc.favoriteCount || 0) - 1);
      await this.documentRepository.save(doc);
    }

    return { message: '已取消收藏', docId };
  }

  /** 获取当前用户的收藏列表（含文档信息，排除已删除文档） */
  async findAll(queryDto: QueryFavoritesDto, userId: string) {
    const { page = 1, pageSize = 20 } = queryDto;
    const skip = (page - 1) * pageSize;

    const qb = this.favoriteRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.document', 'd')
      .where('f.userId = :userId', { userId })
      .andWhere('d.status != :deleted', { deleted: 'deleted' })
      .orderBy('f.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return { items, total, page, pageSize };
  }
}
