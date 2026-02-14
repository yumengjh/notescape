import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSecureTransportTables1762000000000 implements MigrationInterface {
  name = 'CreateSecureTransportTables1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'secure_channels',
        columns: [
          {
            name: 'id',
            type: 'bigserial',
            isPrimary: true,
          },
          {
            name: 'channel_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'session_id',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'key_cipher',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'key_iv',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'key_tag',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'device_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'active'",
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'last_activity_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'secure_channels',
      new TableIndex({
        name: 'IDX_secure_channels_user_id',
        columnNames: ['user_id'],
      }),
    );
    await queryRunner.createIndex(
      'secure_channels',
      new TableIndex({
        name: 'IDX_secure_channels_session_id',
        columnNames: ['session_id'],
      }),
    );
    await queryRunner.createIndex(
      'secure_channels',
      new TableIndex({
        name: 'IDX_secure_channels_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'secure_channels',
      new TableIndex({
        name: 'IDX_secure_channels_expires_at',
        columnNames: ['expires_at'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'secure_replay_guard',
        columns: [
          {
            name: 'id',
            type: 'bigserial',
            isPrimary: true,
          },
          {
            name: 'channel_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'req_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'nonce',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'expire_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
        uniques: [
          {
            name: 'UQ_secure_replay_guard_channel_req_id',
            columnNames: ['channel_id', 'req_id'],
          },
          {
            name: 'UQ_secure_replay_guard_channel_nonce',
            columnNames: ['channel_id', 'nonce'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'secure_replay_guard',
      new TableIndex({
        name: 'IDX_secure_replay_guard_expire_at',
        columnNames: ['expire_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('secure_replay_guard', 'IDX_secure_replay_guard_expire_at');
    await queryRunner.dropTable('secure_replay_guard', true);

    await queryRunner.dropIndex('secure_channels', 'IDX_secure_channels_expires_at');
    await queryRunner.dropIndex('secure_channels', 'IDX_secure_channels_status');
    await queryRunner.dropIndex('secure_channels', 'IDX_secure_channels_session_id');
    await queryRunner.dropIndex('secure_channels', 'IDX_secure_channels_user_id');
    await queryRunner.dropTable('secure_channels', true);
  }
}
