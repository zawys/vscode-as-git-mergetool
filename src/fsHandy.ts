import { access, copyFile, readFile, realpath, stat, Stats } from "fs";

export function getStats(path: string): Promise<Stats | undefined> {
  return new Promise<Stats | undefined>((resolve) => {
    stat(path, (error, stats) => {
      resolve(error ? undefined : stats);
    });
  });
}

export function getRealPath(path: string): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    realpath(path, (error, resolvedPath) => {
      resolve(error ? undefined : resolvedPath);
    });
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
  if (stats === undefined) {
    return stats;
  }
  if (stats.isFile()) {
    return FileType.regular;
  }
  if (stats.isDirectory()) {
    return FileType.directory;
  }
  if (stats.isSocket()) {
    return FileType.socket;
  }
  if (stats.isFIFO()) {
    return FileType.fIFO;
  }
  if (stats.isSymbolicLink()) {
    return FileType.symbolicLink;
  }
  if (stats.isBlockDevice()) {
    return FileType.blockDevice;
  }
  if (stats.isCharacterDevice()) {
    return FileType.characterDevice;
  }
  return FileType.notExisting;
}

export function testFile(path: string, mode: number): Promise<boolean> {
  return new Promise((resolve) => {
    access(path, mode, (error) => resolve(!error));
  });
}

export function getContents(path: string): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    readFile(path, { encoding: "utf-8" }, (error, data) => {
      resolve(error ? undefined : data);
    });
  });
}

/**
 *
 * @param firstPath
 * @param secondPath
 * @returns `true` iff the file contents equal. `false` in any other case.
 */
export async function fileContentsEqual(
  firstPath: string,
  secondPath: string
): Promise<boolean> {
  const promises = [getContents(firstPath), getContents(secondPath)];
  if ((await Promise.race(promises)) === undefined) {
    return false;
  }
  const [firstContents, secondContents] = await Promise.all(promises);
  if (firstContents === undefined || secondContents === undefined) {
    return false;
  }
  return firstContents === secondContents;
}

export function copy(
  sourcePath: string,
  destinationPath: string
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    copyFile(sourcePath, destinationPath, (error) => {
      resolve(error === null);
    });
  });
}
