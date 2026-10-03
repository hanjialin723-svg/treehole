import { backup, DatabaseSync } from 'node:sqlite';
import { chmod, link, lstat, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Publish a consistent SQLite snapshot without ever overwriting a destination. */
export async function backupDiary(source, destination) {
  const sourcePath = await realpath(resolve(source));
  if (!(await stat(sourcePath)).isFile()) throw new Error('数据库源必须是已存在的文件。');

  const requested = resolve(destination ?? join(dirname(sourcePath), 'backups',
    `diary-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.sqlite`));
  await mkdir(dirname(requested), { recursive: true, mode: 0o700 });
  const outputPath = join(await realpath(dirname(requested)), basename(requested));
  if (outputPath === sourcePath) throw new Error('备份目标不能是正在使用的数据库。');
  try {
    await lstat(outputPath);
    throw new Error('备份目标已经存在，请换一个文件名。');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Write privately first. link() publishes atomically with EEXIST protection,
  // including if another backup creates the target while this one is running.
  const temporaryDirectory = await mkdtemp(join(dirname(outputPath), '.diary-backup-'));
  const temporaryPath = join(temporaryDirectory, 'snapshot.sqlite');
  let database;
  try {
    database = new DatabaseSync(sourcePath, { readOnly: true });
    await backup(database, temporaryPath);
    await chmod(temporaryPath, 0o600);
    await link(temporaryPath, outputPath);
    return outputPath;
  } finally {
    database?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length > 3) {
    console.error('用法：node scripts/backup-db.mjs [备份文件路径]');
    process.exitCode = 1;
  } else {
    try {
      const savedPath = await backupDiary(process.env.DATABASE_PATH || './data/diary.sqlite', process.argv[2]);
      console.log(savedPath);
    } catch (error) {
      console.error(`备份失败：${error.message}`);
      process.exitCode = 1;
    }
  }
}
