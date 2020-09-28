// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

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
  const stats = await getStats(path);
  return stats === undefined
    ? undefined
    : stats.isFile()
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
    : FileType.notExisting;
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
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    fs.rename(sourcePath, destinationPath, (error) => {
      resolve(error === null);
    });
  });
}
