import { exec } from 'node:child_process';

export function openFolder(folderPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${folderPath}"`;
    } else if (platform === 'win32') {
      command = `start "" "${folderPath}"`;
    } else {
      command = `xdg-open "${folderPath}"`;
    }

    exec(command, (error) => {
      resolve(!error);
    });
  });
}
