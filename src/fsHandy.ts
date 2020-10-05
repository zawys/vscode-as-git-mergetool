// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { ENOENT } from "constants";
import * as fs from "fs";
import { createUIError, UIError } from "./uIError";

export function getStats(path: string): Promise<fs.Stats | undefined> {
  return new Promise<fs.Stats | undefined>((resolve) => {
    fs.stat(path, (error, stats) => {
      resolve(error ? undefined : stats);
    });
  });
}

export function getRealPath(path: string): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    fs.realpath(path, (error, resolvedPath) => {
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
  const statResult = await new Promise<{
    error: null | NodeJS.ErrnoException;
    stats?: fs.Stats;
  }>((resolve) => {
    fs.stat(path, (error, stats) => {
      resolve({ error, stats });
    });
  });
  if (statResult.error !== null) {
    if (statResult.error.errno === -ENOENT) {
      return FileType.notExisting;
    }
    return undefined;
  }
  const stats = statResult.stats;
  if (stats === undefined) {
    return undefined;
  }
  return stats.isFile()
    ? FileType.regular
    : stats.isDirectory()
    ? FileType.directory
    : stats.isSocket()
    ? FileType.socket
    : stats.isFIFO()
    ? FileType.fIFO
    : stats.isSymbolicLink()
    ? FileType.symbolicLink
    : stats.isBlockDevice()
    ? FileType.blockDevice
    : stats.isCharacterDevice()
    ? FileType.characterDevice
    : undefined;
}

export function testFile(path: string, mode: number): Promise<boolean> {
  return new Promise((resolve) => {
    fs.access(path, mode, (error) => resolve(!error));
  });
}

export function getContents(path: string): Promise<string | undefined> {
  return new Promise<string>((resolve) => {
    fs.readFile(path, { encoding: "utf-8" }, (error, data) => {
      resolve(error ? undefined : data);
    });
  });
}

export function setContents(
  path: string,
  contents: string
): Promise<UIError | undefined> {
  return new Promise<UIError | undefined>((resolve) => {
    fs.writeFile(path, contents, (error) => {
      resolve(
        error !== null ? createUIError(formatErrnoException(error)) : undefined
      );
    });
  });
}

export function formatErrnoException(result: NodeJS.ErrnoException): string {
  return `${result.name}: ${result.message}. \nCode: ${
    result.code || "unknown"
  }; Error number: ${result.errno || "unknown"}`;
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
): Promise<UIError | undefined> {
  return new Promise<UIError | undefined>((resolve) => {
    fs.copyFile(sourcePath, destinationPath, (error) => {
      resolve(
        error === null ? undefined : createUIError(formatErrnoException(error))
      );
    });
  });
}

export function rename(
  sourcePath: string,
  destinationPath: string
): Promise<UIError | void> {
  return new Promise<UIError | void>((resolve) => {
    fs.rename(sourcePath, destinationPath, (error) => {
      resolve(
        error === null
          ? undefined
          : createUIError(
              `Could not move ${sourcePath} to ${destinationPath}: ${formatErrnoException(
                error
              )}`
            )
      );
    });
  });
}

export function remove(path: string): Promise<UIError | undefined> {
  return new Promise<UIError | undefined>((resolve) => {
    fs.unlink(path, (error) => {
      resolve(
        error === null ? undefined : createUIError(formatErrnoException(error))
      );
    });
  });
}

export function mkdir(
  path: string,
  recursive = false,
  mode?: string | number
): Promise<UIError | void> {
  return new Promise<UIError | undefined>((resolve) => {
    fs.mkdir(
      path,
      {
        recursive,
        mode,
      },
      (error) => {
        resolve(
          error === null
            ? undefined
            : createUIError(
                `Could not create directory ${path}: ${formatErrnoException(
                  error
                )}`
              )
        );
      }
    );
  });
}
