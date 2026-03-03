// ===== 知识库前端应用 =====

// 状态管理
const state = {
    currentPath: '',
    currentFile: null,
    isEditing: false,
    searchTimer: null,
    theme: 'dark', // 默认主题
    sortMode: localStorage.getItem('kb_sortMode') || 'mtime-desc', // 排序模式
    currentItems: [] // 当前目录的文件列表（用于重新排序）
};

// ===== 工具函数 =====
function getFileIcon(item) {
    if (item.isDir) return '📁';
    const ext = item.name.split('.').pop().toLowerCase();
    const icons = {
        md: '📝', txt: '📄',
        js: '🟨', ts: '🔷', py: '🐍', html: '🌐', css: '🎨', json: '📋',
        pdf: '📕',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️',
        mp4: '🎬', mov: '🎬',
        mp3: '🎵', wav: '🎵',
        zip: '📦', rar: '📦',
        doc: '📘', docx: '📘',
        xls: '📊', xlsx: '📊',
        ppt: '📙', pptx: '📙',
    };
    return icons[ext] || '📄';
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';

    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// ===== API 请求 =====
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('请求失败');
    return res.json();
}

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('请求失败');
    return res.json();
}

async function apiDelete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error('请求失败');
    return res.json();
}

// ===== 视图切换 =====
function showView(viewId) {
    ['welcomeView', 'fileListView', 'filePreview', 'editorView'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    document.getElementById(viewId).style.display = '';
}

// ===== 面包屑导航 =====
function updateBreadcrumb(filePath) {
    const bc = document.getElementById('breadcrumb');
    const parts = filePath ? filePath.split('/').filter(Boolean) : [];
    let html = '<a href="#" data-path="" class="crumb" onclick="navigateTo(\'\'); return false;">首页</a>';

    let accumulated = '';
    parts.forEach((part, i) => {
        html += '<span class="crumb-sep">›</span>';
        accumulated += (accumulated ? '/' : '') + part;
        const isLast = i === parts.length - 1;
        html += `<a href="#" data-path="${accumulated}" class="crumb${isLast ? '' : ''}" onclick="navigateTo('${accumulated}'); return false;">${part}</a>`;
    });

    bc.innerHTML = html;
}

// ===== 文件树（侧边栏） =====
async function loadFileTree(dirPath = '') {
    const tree = document.getElementById('fileTree');

    try {
        const data = await apiGet('/api/files?path=' + encodeURIComponent(dirPath));

        if (data.items.length === 0) {
            tree.innerHTML = '<div class="search-empty">暂无文件</div>';
            return;
        }

        tree.innerHTML = data.items.map(item => `
      <div class="tree-item ${state.currentPath === item.path ? 'active' : ''}"
           onclick="handleTreeClick('${item.path}', ${item.isDir})"
           title="${item.name}">
        <span class="tree-icon">${getFileIcon(item)}</span>
        <span class="tree-name">${item.name}</span>
        ${item.isDir ? `<span class="tree-badge">${item.childCount}</span>` : ''}
      </div>
    `).join('');
    } catch (err) {
        tree.innerHTML = '<div class="search-empty">加载失败</div>';
    }
}

function handleTreeClick(filePath, isDir) {
    if (isDir) {
        navigateTo(filePath);
    } else {
        openFile(filePath);
    }
}

// ===== 排序 =====
function sortItems(items, mode) {
    return [...items].sort((a, b) => {
        // 文件夹始终在前
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        // 按排序模式排序
        switch (mode) {
            case 'name-asc':
                return a.name.localeCompare(b.name, 'zh-CN');
            case 'name-desc':
                return b.name.localeCompare(a.name, 'zh-CN');
            case 'mtime-asc':
                return new Date(a.modifiedAt) - new Date(b.modifiedAt);
            case 'mtime-desc':
            default:
                return new Date(b.modifiedAt) - new Date(a.modifiedAt);
        }
    });
}

function renderFileList(items) {
    const grid = document.getElementById('fileListGrid');
    grid.innerHTML = items.map(item => `
      <div class="file-card" onclick="handleTreeClick('${item.path}', ${item.isDir})">
        <div class="file-card-icon">${getFileIcon(item)}</div>
        <div class="file-card-name">${item.name}</div>
        <div class="file-card-meta">
          ${item.isDir ? item.childCount + ' 项' : formatSize(item.size)}
          · ${formatDate(item.modifiedAt)}
        </div>
      </div>
    `).join('');
}

function updateSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === state.sortMode);
    });
}

function setSort(mode) {
    state.sortMode = mode;
    localStorage.setItem('kb_sortMode', mode);
    updateSortButtons();
    if (state.currentItems.length > 0) {
        const sorted = sortItems(state.currentItems, mode);
        renderFileList(sorted);
    }
}

// ===== 导航 =====
async function navigateTo(dirPath) {
    state.currentPath = dirPath;
    state.currentFile = null;
    state.isEditing = false;

    updateBreadcrumb(dirPath);
    updateButtons();

    if (!dirPath) {
        showView('welcomeView');
        loadFileTree('');
        return;
    }

    try {
        const data = await apiGet('/api/files?path=' + encodeURIComponent(dirPath));

        // 更新侧边栏
        loadFileTree(dirPath);

        // 显示文件列表
        const dirName = dirPath.split('/').pop() || '知识库';
        document.getElementById('currentDirName').textContent = dirName;
        document.getElementById('fileCount').textContent = data.items.length + ' 项';

        // 保存原始数据并排序渲染
        state.currentItems = data.items;
        const sorted = sortItems(data.items, state.sortMode);
        renderFileList(sorted);
        updateSortButtons();

        showView('fileListView');
    } catch (err) {
        showToast('加载失败', 'error');
    }
}

// ===== 打开文件 =====
async function openFile(filePath) {
    try {
        const data = await apiGet('/api/file?path=' + encodeURIComponent(filePath));
        state.currentFile = data;
        state.currentPath = filePath;
        state.isEditing = false;

        updateBreadcrumb(filePath);
        updateButtons();

        // 文件元信息
        document.getElementById('fileMeta').textContent =
            `${data.type} · ${formatSize(data.size)} · 修改于 ${formatDate(data.modifiedAt)}`;

        if (data.content !== null) {
            const ext = data.name.split('.').pop().toLowerCase();

            if (ext === 'md') {
                // Markdown 渲染
                const rendered = marked.parse(data.content, {
                    gfm: true,
                    breaks: true,
                    highlight: function (code, lang) {
                        if (lang && hljs.getLanguage(lang)) {
                            return hljs.highlight(code, { language: lang }).value;
                        }
                        return hljs.highlightAuto(code).value;
                    },
                });
                document.getElementById('markdownContent').innerHTML = rendered;
                document.getElementById('markdownContent').style.display = '';
                document.getElementById('codeContent').style.display = 'none';
                document.getElementById('unsupportedContent').style.display = 'none';

                // 高亮代码块
                document.querySelectorAll('#markdownContent pre code').forEach(block => {
                    hljs.highlightElement(block);
                });
            } else {
                // 代码/文本渲染
                const codeEl = document.querySelector('#codeContent code');
                codeEl.textContent = data.content;
                codeEl.className = '';
                if (ext && hljs.getLanguage(ext)) {
                    codeEl.classList.add('language-' + ext);
                    hljs.highlightElement(codeEl);
                }
                document.getElementById('markdownContent').style.display = 'none';
                document.getElementById('codeContent').style.display = '';
                document.getElementById('unsupportedContent').style.display = 'none';
            }
        } else {
            // 不支持预览
            document.getElementById('markdownContent').style.display = 'none';
            document.getElementById('codeContent').style.display = 'none';
            document.getElementById('unsupportedContent').style.display = '';
        }

        showView('filePreview');
    } catch (err) {
        showToast('打开文件失败', 'error');
    }
}

// ===== 编辑功能 =====
function enterEditMode() {
    if (!state.currentFile) return;
    state.isEditing = true;

    document.getElementById('editorTextarea').value = state.currentFile.content || '';
    showView('editorView');
    updateButtons();
    document.getElementById('editorTextarea').focus();
}

async function saveFile() {
    const content = document.getElementById('editorTextarea').value;
    const filePath = state.currentFile ? state.currentFile.path : state.currentPath;

    try {
        await apiPost('/api/file?path=' + encodeURIComponent(filePath), { content });
        showToast('✅ 保存成功', 'success');

        // 重新打开文件以刷新
        await openFile(filePath);
    } catch (err) {
        showToast('保存失败', 'error');
    }
}

async function deleteFile() {
    if (!state.currentFile) return;
    if (!confirm(`确定要删除「${state.currentFile.name}」吗？`)) return;

    try {
        await apiDelete('/api/file?path=' + encodeURIComponent(state.currentFile.path));
        showToast('🗑️ 已删除', 'success');

        // 返回上级目录
        const parent = state.currentFile.path.split('/').slice(0, -1).join('/');
        navigateTo(parent);
    } catch (err) {
        showToast('删除失败', 'error');
    }
}

function updateButtons() {
    const isFile = state.currentFile !== null && !state.isEditing;
    const isEditing = state.isEditing;
    const canEdit = state.currentFile && state.currentFile.content !== null;

    document.getElementById('btnEdit').style.display = (isFile && canEdit) ? '' : 'none';
    document.getElementById('btnSave').style.display = isEditing ? '' : 'none';
    document.getElementById('btnDelete').style.display = isFile ? '' : 'none';
}

// ===== 搜索 =====
async function performSearch(query) {
    const resultsEl = document.getElementById('searchResults');
    const treeEl = document.getElementById('fileTree');

    if (!query.trim()) {
        resultsEl.style.display = 'none';
        treeEl.style.display = '';
        return;
    }

    treeEl.style.display = 'none';
    resultsEl.style.display = '';

    try {
        const data = await apiGet('/api/search?q=' + encodeURIComponent(query));

        if (data.results.length === 0) {
            resultsEl.innerHTML = '<div class="search-empty">🔍 未找到相关结果</div>';
            return;
        }

        resultsEl.innerHTML = data.results.map(item => {
            const matchesHtml = item.matches.slice(0, 3).map(m => {
                const highlighted = m.text.replace(
                    new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                    '<mark>$1</mark>'
                );
                return `<div class="search-result-match">第 ${m.line} 行：${highlighted}</div>`;
            }).join('');

            return `
        <div class="search-result-item" onclick="handleTreeClick('${item.path}', ${item.isDir})">
          <div class="search-result-name">${getFileIcon(item)} ${item.name}</div>
          <div class="search-result-path">${item.path}</div>
          ${matchesHtml}
        </div>
      `;
        }).join('');
    } catch (err) {
        resultsEl.innerHTML = '<div class="search-empty">搜索失败</div>';
    }
}

// ===== 模态框 =====
function showModal(title, placeholder) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalInput').placeholder = placeholder;
        document.getElementById('modalInput').value = '';
        modal.style.display = '';

        setTimeout(() => document.getElementById('modalInput').focus(), 100);

        const cleanup = () => {
            modal.style.display = 'none';
            document.getElementById('modalConfirm').onclick = null;
            document.getElementById('modalCancel').onclick = null;
            document.getElementById('modalInput').onkeydown = null;
        };

        document.getElementById('modalConfirm').onclick = () => {
            const val = document.getElementById('modalInput').value.trim();
            cleanup();
            resolve(val || null);
        };

        document.getElementById('modalCancel').onclick = () => {
            cleanup();
            resolve(null);
        };

        document.querySelector('.modal-overlay').onclick = () => {
            cleanup();
            resolve(null);
        };

        document.getElementById('modalInput').onkeydown = (e) => {
            if (e.key === 'Enter') document.getElementById('modalConfirm').click();
            if (e.key === 'Escape') document.getElementById('modalCancel').click();
        };
    });
}

// ===== 新建笔记 =====
async function createNewNote() {
    const name = await showModal('新建笔记', '输入笔记名称（如：学习心得）');
    if (!name) return;

    const fileName = name.endsWith('.md') ? name : name + '.md';
    const dir = state.currentPath || '';
    const filePath = dir ? dir + '/' + fileName : fileName;

    try {
        await apiPost('/api/file?path=' + encodeURIComponent(filePath), {
            content: `# ${name.replace('.md', '')}\n\n在这里写下你的笔记...\n`,
        });
        showToast('✅ 笔记已创建', 'success');
        await openFile(filePath);
        enterEditMode();
    } catch (err) {
        showToast('创建失败', 'error');
    }
}

// ===== 新建文件夹 =====
async function createNewFolder() {
    const name = await showModal('新建文件夹', '输入文件夹名称');
    if (!name) return;

    const dir = state.currentPath || '';
    const folderPath = dir ? dir + '/' + name : name;

    try {
        await apiPost('/api/mkdir?path=' + encodeURIComponent(folderPath), {});
        showToast('✅ 文件夹已创建', 'success');
        navigateTo(state.currentPath || '');
        loadFileTree(state.currentPath || '');
    } catch (err) {
        showToast('创建失败', 'error');
    }
}

// ===== 编辑器工具栏 =====
function handleToolbarAction(action) {
    const textarea = document.getElementById('editorTextarea');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let insert = '';
    let cursorOffset = 0;

    switch (action) {
        case 'bold':
            insert = `**${selected || '粗体文字'}**`;
            cursorOffset = selected ? 0 : -2;
            break;
        case 'italic':
            insert = `*${selected || '斜体文字'}*`;
            cursorOffset = selected ? 0 : -1;
            break;
        case 'heading':
            insert = `## ${selected || '标题'}`;
            break;
        case 'code':
            if (selected.includes('\n')) {
                insert = '```\n' + selected + '\n```';
            } else {
                insert = '`' + (selected || '代码') + '`';
                cursorOffset = selected ? 0 : -1;
            }
            break;
        case 'link':
            insert = `[${selected || '链接文字'}](https://)`;
            cursorOffset = -1;
            break;
        case 'list':
            insert = `- ${selected || '列表项'}`;
            break;
        case 'table':
            insert = '| 列1 | 列2 | 列3 |\n|------|------|------|\n| 内容 | 内容 | 内容 |';
            break;
    }

    textarea.value = text.substring(0, start) + insert + text.substring(end);
    textarea.focus();

    const newPos = start + insert.length + cursorOffset;
    textarea.setSelectionRange(newPos, newPos);
}

// ===== 编辑器预览切换 =====
function toggleEditorPreview() {
    const preview = document.getElementById('editorPreview');
    const textarea = document.getElementById('editorTextarea');
    const btn = document.getElementById('btnPreviewToggle');

    if (preview.style.display === 'none') {
        preview.style.display = '';
        preview.innerHTML = marked.parse(textarea.value, { gfm: true, breaks: true });
        preview.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        btn.textContent = '👁 隐藏预览';
    } else {
        preview.style.display = 'none';
        btn.textContent = '👁 预览';
    }
}

// ===== 主题管理 =====
function initTheme() {
    const savedTheme = localStorage.getItem('kb_theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    state.theme = savedTheme ? savedTheme : (prefersLight ? 'light' : 'dark');
    applyTheme(state.theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIconDark').style.display = theme === 'dark' ? '' : 'none';
    document.getElementById('themeIconLight').style.display = theme === 'light' ? '' : 'none';

    // 切换 highlight.js 主题
    const hljsLink = document.getElementById('hljsTheme');
    if (theme === 'light') {
        hljsLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    } else {
        hljsLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    }
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('kb_theme', state.theme);
    applyTheme(state.theme);
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    // 初始化深浅色主题
    initTheme();

    // 加载文件树
    loadFileTree('');

    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => performSearch(e.target.value), 300);
    });

    // 快捷键 ⌘K 聚焦搜索
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
        // Escape 退出搜索
        if (e.key === 'Escape') {
            document.getElementById('searchInput').value = '';
            performSearch('');
            document.getElementById('searchInput').blur();
        }
        // ⌘S 保存
        if ((e.metaKey || e.ctrlKey) && e.key === 's' && state.isEditing) {
            e.preventDefault();
            saveFile();
        }
    });

    // 按钮事件
    document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);
    document.getElementById('btnNewNote').addEventListener('click', createNewNote);
    document.getElementById('btnNewFolder').addEventListener('click', createNewFolder);
    document.getElementById('btnEdit').addEventListener('click', enterEditMode);
    document.getElementById('btnSave').addEventListener('click', saveFile);
    document.getElementById('btnDelete').addEventListener('click', deleteFile);
    document.getElementById('btnPreviewToggle').addEventListener('click', toggleEditorPreview);

    // 移动端侧边栏
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // 工具栏
    document.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleToolbarAction(btn.dataset.action));
    });

    // 排序按钮
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => setSort(btn.dataset.sort));
    });

    // 欢迎页动作卡片
    document.getElementById('actionBrowse').addEventListener('click', () => {
        navigateTo('');
        loadFileTree('');
    });
    document.getElementById('actionNewNote').addEventListener('click', createNewNote);
    document.getElementById('actionSearch').addEventListener('click', () => {
        document.getElementById('searchInput').focus();
    });

    // Logo 点击返回首页
    document.querySelector('.logo').addEventListener('click', () => {
        navigateTo('');
        loadFileTree('');
    });

    // 实时预览（编辑时）
    document.getElementById('editorTextarea').addEventListener('input', () => {
        const preview = document.getElementById('editorPreview');
        if (preview.style.display !== 'none') {
            preview.innerHTML = marked.parse(document.getElementById('editorTextarea').value, {
                gfm: true, breaks: true,
            });
            preview.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
    });
});
