import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 提高 chunk 大小警告限制（因为已经做了代码分割）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 将 node_modules 中的依赖分离
          if (id.includes('node_modules')) {
            // Tiptap 相关包（编辑器核心）
            if (id.includes('@tiptap')) {
              return 'tiptap';
            }
            
            // ProseMirror 相关包（Tiptap 的底层依赖）
            if (id.includes('prosemirror')) {
              return 'prosemirror';
            }
            
            // Ant Design 相关包
            if (id.includes('antd') || id.includes('@ant-design')) {
              return 'antd';
            }
            
            // Prism.js（代码高亮）
            if (id.includes('prismjs')) {
              return 'prismjs';
            }
            
            // React 相关
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            
            // 其他第三方库
            return 'vendor';
          }
          
          // 将编辑器相关代码分离
          if (id.includes('/src/editor/')) {
            return 'editor';
          }
          
          // 将组件分离
          if (id.includes('/src/component/')) {
            return 'components';
          }
        },
        // 优化 chunk 文件命名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // 启用压缩（rolldown-vite 使用默认压缩方式）
    minify: true,
    // 启用 source map（可选，生产环境可以关闭以减小体积）
    sourcemap: false,
  },
})
