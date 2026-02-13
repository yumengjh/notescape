import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('block_versions')
@Index(['blockId', 'ver'])
@Index(['docId'])
export class BlockVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 100 })
  versionId: string;

  @Column()
  docId: string;

  @ManyToOne('Block', 'versions')
  @JoinColumn({ name: 'block_id', referencedColumnName: 'blockId' })
  block: any;

  @Column()
  blockId: string;

  @Column()
  ver: number;

  @Column({ type: 'bigint' })
  createdAt: number;

  @Column()
  createdBy: string;

  @Column()
  parentId: string;

  @Column()
  sortKey: string;

  @Column({ default: 0 })
  indent: number;

  @Column({ default: false })
  collapsed: boolean;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column()
  hash: string;

  @Column({ type: 'text', nullable: true })
  plainText: string;

  @Column({ type: 'jsonb', default: [] })
  refs: object[];

  @Column({ type: 'tsvector', nullable: true })
  searchVector: any;
}
