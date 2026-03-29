import { execFile } from 'node:child_process';

export function openFolder(folderPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      command = 'open';
      args = [folderPath];
    } else if (platform === 'win32') {
      command = 'explorer';
      args = [folderPath];
    } else {
      command = 'xdg-open';
      args = [folderPath];
    }

    execFile(command, args, { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}
