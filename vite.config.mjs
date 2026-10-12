import { defineConfig } from 'vite';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { readdirSync, copyFileSync } from 'fs';

export default defineConfig({
  build: {
    copyPublicDir: true,
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-assets',
      writeBundle() {
        const assetsDir = join(process.cwd(), 'assets');
        const distAssetsDir = join(process.cwd(), 'dist', 'assets');
        
        // Create dist/assets directory
        if (!existsSync(distAssetsDir)) {
          mkdirSync(distAssetsDir, { recursive: true });
        }
        
        // Copy all files from assets to dist/assets
        function copyDir(src, dest) {
          if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true });
          }
          
          const entries = readdirSync(src, { withFileTypes: true });
          
          for (const entry of entries) {
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);
            
            if (entry.isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              copyFileSync(srcPath, destPath);
            }
          }
        }
        
        copyDir(assetsDir, distAssetsDir);
      }
    }
  ]
});
