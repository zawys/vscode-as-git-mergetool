import * as fs from 'fs';

export function getStats(path: string): Promise<fs.Stats | undefined> {
  return new Promise<fs.Stats | undefined>((resolve) =>
    fs.stat(path, (err, stats) => resolve(err ? undefined : stats))
  );
}

export function getRealPath(path: string): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    fs.realpath(path, (err, resolvedPath) =>
      resolve(err ? undefined : resolvedPath)
    );
  });
}

export enum FileType {
  notExisting,
  regular,
  directory,
  fIFO,
  socket,
  blockDevice,
  characterDevice,
  symbolicLink,
}

export async function getFileType(
  path: string
): Promise<FileType | undefined> {
  const stats = await getStats(path);
  if (stats === undefined) { return stats; }
  if (stats.isFile()) { return FileType.regular; }
  if (stats.isDirectory()) { return FileType.directory; }
  if (stats.isSocket()) { return FileType.socket; }
  if (stats.isFIFO()) { return FileType.fIFO; }
  if (stats.isSymbolicLink()) { return FileType.symbolicLink; }
  if (stats.isBlockDevice()) { return FileType.blockDevice; }
  if (stats.isCharacterDevice()) { return FileType.characterDevice; }
  return FileType.notExisting;
}

export function testFile(path: string, mode: number): Promise<boolean> {
  return new Promise(resolve => fs.access(path, mode, (err) => resolve(!err)));
}
