import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('doc_snapshots')
@Index(['docId', 'docVer'])
export class DocSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 150 })
  snapshotId: string;

  @ManyToOne('Document')
  @JoinColumn({ name: 'doc_id', referencedColumnName: 'docId' })
  document: any;

  @Column()
  docId: string;

  @Column()
  docVer: number;

  @Column({ type: 'bigint' })
  createdAt: number;

  @Column()
  rootBlockId: string;

  @Column({ type: 'jsonb' })
  blockVersionMap: object;
}
