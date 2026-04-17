import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

export async function createZip(directoryPath: string): Promise<Buffer> {
  const zip = new JSZip();
  const files = await fs.readdir(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const stats = await fs.stat(filePath);
    
    if (stats.isFile()) {
      const content = await fs.readFile(filePath);
      zip.file(file, content);
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  return zipBuffer;
}
