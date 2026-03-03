const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 安全检查：确保路径在 data 目录内
function safePath(userPath) {
  const resolved = path.resolve(DATA_DIR, userPath || '');
  if (!resolved.startsWith(DATA_DIR)) {
    return null;
  }
  return resolved;
}

// 获取文件图标类型
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.md': 'markdown',
    '.txt': '文本',
    '.js': '代码',
    '.ts': '代码',
    '.py': '代码',
    '.html': '代码',
    '.css': '代码',
    '.json': '数据',
    '.pdf': 'PDF',
    '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片', '.svg': '图片',
    '.mp4': '视频', '.mov': '视频',
    '.mp3': '音频', '.wav': '音频',
    '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包',
    '.doc': '文档', '.docx': '文档',
    '.xls': '表格', '.xlsx': '表格',
    '.ppt': '演示', '.pptx': '演示',
  };
  return map[ext] || '文件';
}

// API: 列出目录内容
app.get('/api/files', (req, res) => {
  const dirPath = safePath(req.query.path || '');
  if (!dirPath) return res.status(403).json({ error: '访问被拒绝' });

  try {
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: '目录不存在' });
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(item => !item.name.startsWith('.'))
      .map(item => {
        const fullPath = path.join(dirPath, item.name);
        const stats = fs.statSync(fullPath);
        const relativePath = path.relative(DATA_DIR, fullPath);

        if (item.isDirectory()) {
          // 计算子项数量
          let childCount = 0;
          try {
            childCount = fs.readdirSync(fullPath).filter(f => !f.startsWith('.')).length;
          } catch (e) { }

          return {
            name: item.name,
            path: relativePath,
            type: '文件夹',
            isDir: true,
            childCount,
            modifiedAt: stats.mtime.toISOString(),
          };
        } else {
          return {
            name: item.name,
            path: relativePath,
            type: getFileType(item.name),
            isDir: false,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          };
        }
      })
      .sort((a, b) => {
        // 文件夹在前
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        // 同类型按最后修改时间倒序（最新的在前）
        return new Date(b.modifiedAt) - new Date(a.modifiedAt);
      });

    res.json({ items, path: path.relative(DATA_DIR, dirPath) || '' });
  } catch (err) {
    res.status(500).json({ error: '读取目录失败: ' + err.message });
  }
});

// API: 读取文件内容
app.get('/api/file', (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) return res.status(403).json({ error: '访问被拒绝' });

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const textExts = ['.md', '.txt', '.js', '.ts', '.py', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.sh', '.bat', '.log', '.csv'];

    if (textExts.includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({
        name: path.basename(filePath),
        path: path.relative(DATA_DIR, filePath),
        content,
        type: getFileType(path.basename(filePath)),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    } else {
      res.json({
        name: path.basename(filePath),
        path: path.relative(DATA_DIR, filePath),
        content: null,
        type: getFileType(path.basename(filePath)),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        message: '此文件类型暂不支持预览',
      });
    }
  } catch (err) {
    res.status(500).json({ error: '读取文件失败: ' + err.message });
  }
});

// API: 保存文件
app.post('/api/file', (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) return res.status(403).json({ error: '访问被拒绝' });

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, req.body.content || '', 'utf-8');
    res.json({ success: true, message: '保存成功' });
  } catch (err) {
    res.status(500).json({ error: '保存失败: ' + err.message });
  }
});

// API: 创建文件夹
app.post('/api/mkdir', (req, res) => {
  const dirPath = safePath(req.query.path);
  if (!dirPath) return res.status(403).json({ error: '访问被拒绝' });

  try {
    if (fs.existsSync(dirPath)) {
      return res.status(400).json({ error: '文件夹已存在' });
    }
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ success: true, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ error: '创建文件夹失败: ' + err.message });
  }
});

// API: 删除文件或文件夹
app.delete('/api/file', (req, res) => {
  const targetPath = safePath(req.query.path);
  if (!targetPath) return res.status(403).json({ error: '访问被拒绝' });
  if (targetPath === DATA_DIR) return res.status(403).json({ error: '不能删除根目录' });

  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true });
    } else {
      fs.unlinkSync(targetPath);
    }
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: '删除失败: ' + err.message });
  }
});

// API: 全文搜索
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query) return res.json({ results: [] });

  const results = [];
  const MAX_RESULTS = 50;

  function searchDir(dir) {
    if (results.length >= MAX_RESULTS) return;

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (results.length >= MAX_RESULTS) break;
        if (item.name.startsWith('.')) continue;

        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          // 文件夹名匹配
          if (item.name.toLowerCase().includes(query)) {
            results.push({
              name: item.name,
              path: path.relative(DATA_DIR, fullPath),
              type: '文件夹',
              isDir: true,
              matches: [],
            });
          }
          searchDir(fullPath);
        } else {
          const ext = path.extname(item.name).toLowerCase();
          const textExts = ['.md', '.txt', '.js', '.ts', '.py', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.sh', '.log', '.csv'];
          const nameMatch = item.name.toLowerCase().includes(query);

          if (textExts.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              const matches = [];

              lines.forEach((line, idx) => {
                if (line.toLowerCase().includes(query)) {
                  matches.push({
                    line: idx + 1,
                    text: line.trim().substring(0, 200),
                  });
                }
              });

              if (nameMatch || matches.length > 0) {
                results.push({
                  name: item.name,
                  path: path.relative(DATA_DIR, fullPath),
                  type: getFileType(item.name),
                  isDir: false,
                  matches: matches.slice(0, 5),
                });
              }
            } catch (e) { }
          } else if (nameMatch) {
            results.push({
              name: item.name,
              path: path.relative(DATA_DIR, fullPath),
              type: getFileType(item.name),
              isDir: false,
              matches: [],
            });
          }
        }
      }
    } catch (e) { }
  }

  searchDir(DATA_DIR);
  res.json({ results, query });
});

// 所有其他路由返回前端页面
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n📚 知识库已启动！`);
  console.log(`🌐 请访问: http://localhost:${PORT}`);
  console.log(`📁 数据目录: ${DATA_DIR}\n`);
});
