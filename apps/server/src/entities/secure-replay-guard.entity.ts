import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('secure_replay_guard')
@Index(['channelId', 'reqId'], { unique: true })
@Index(['channelId', 'nonce'], { unique: true })
@Index(['expireAt'])
export class SecureReplayGuard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  channelId: string;

  @Column({ name: 'req_id', type: 'varchar', length: 128 })
  reqId: string;

  @Column({ type: 'varchar', length: 128 })
  nonce: string;

  @Column({ name: 'expire_at', type: 'timestamptz' })
  expireAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
