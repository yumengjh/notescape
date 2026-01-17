import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('tags')
@Index(['workspaceId', 'name'], { unique: true })
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  tagId: string;

  @ManyToOne('Workspace', 'tags')
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'workspaceId' })
  workspace: any;

  @Column()
  workspaceId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  color: string;

  @ManyToOne('User')
  @JoinColumn({ name: 'created_by', referencedColumnName: 'userId' })
  createdByUser: any;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 0 })
  usageCount: number;
}
