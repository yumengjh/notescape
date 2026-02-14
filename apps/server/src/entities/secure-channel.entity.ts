import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SecureChannelStatus = 'active' | 'closed' | 'expired';

@Entity('secure_channels')
@Index(['channelId'], { unique: true })
@Index(['userId'])
@Index(['sessionId'])
@Index(['status'])
@Index(['expiresAt'])
export class SecureChannel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'channel_id', type: 'varchar', length: 64, unique: true })
  channelId: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ name: 'session_id', type: 'varchar', length: 64, nullable: true })
  sessionId: string | null;

  @Column({ name: 'key_cipher', type: 'text' })
  keyCipher: string;

  @Column({ name: 'key_iv', type: 'varchar', length: 64 })
  keyIv: string;

  @Column({ name: 'key_tag', type: 'varchar', length: 64 })
  keyTag: string;

  @Column({ name: 'device_id', type: 'varchar', length: 128, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: SecureChannelStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_activity_at', type: 'timestamptz' })
  lastActivityAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
