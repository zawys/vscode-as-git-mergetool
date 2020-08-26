import * as fs from 'fs';

export function getStats(path: string): Promise<fs.Stats | undefined> {
  return new Promise<fs.Stats | undefined>((resolve) =>
    fs.stat(path, (err, stats) => {
      if (err) { resolve(undefined); } else { resolve(stats); }
    })
  );
}
