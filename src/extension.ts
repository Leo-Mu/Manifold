import * as vscode from 'vscode';
import { ContextManager } from './core/ContextManager';
import { ChatHistoryParser } from './parsers/ChatHistoryParser';
import { ContextTreeProvider } from './providers/ContextTreeProvider';
import { DatabaseManager } from './storage/DatabaseManager';
import { ContextItem } from './types/ContextTypes';

let contextManager: ContextManager;
let contextTreeProvider: ContextTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Vibe Context Manager 插件已激活');

    try {
        // 初始化核心组件
        const dbManager = new DatabaseManager(context.globalStorageUri.fsPath);
        const chatParser = new ChatHistoryParser();
        contextManager = new ContextManager(dbManager, chatParser);
        contextTreeProvider = new ContextTreeProvider(contextManager);

        // 注册树视图
        vscode.window.createTreeView('vibeContextTree', {
            treeDataProvider: contextTreeProvider,
            showCollapseAll: true
        });

        // 注册命令
        const commands = [
            vscode.commands.registerCommand('vibeContext.openContextManager', openContextManager),
            vscode.commands.registerCommand('vibeContext.parseCurrentChat', parseCurrentChat),
            vscode.commands.registerCommand('vibeContext.composeContext', composeContext),
            vscode.commands.registerCommand('vibeContext.refreshTree', () => contextTreeProvider.refresh()),
            vscode.commands.registerCommand('vibeContext.openContext', openContext)
        ];

        // 设置上下文
        vscode.commands.executeCommand('setContext', 'vibeContext.enabled', true);

        // 添加到订阅列表
        context.subscriptions.push(...commands);

        // 初始化数据库
        dbManager.initialize().then(() => {
            console.log('数据库初始化完成');
        }).catch((error) => {
            console.error('数据库初始化失败:', error);
            vscode.window.showErrorMessage('Vibe Context Manager 初始化失败，请检查存储权限');
        });

    } catch (error) {
        console.error('插件激活失败:', error);
        vscode.window.showErrorMessage('Vibe Context Manager 激活失败');
    }
}

async function openContextManager() {
    const panel = vscode.window.createWebviewPanel(
        'vibeContextManager',
        'Context Manager',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getWebviewContent();

    // 处理来自webview的消息
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'getContextHistory':
                    handleGetContextHistory(panel);
                    break;
                case 'composeContext':
                    handleComposeContext(message.data);
                    break;
            }
        }
    );
}

async function parseCurrentChat() {
    try {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('请先打开一个文件');
            return;
        }

        const text = activeEditor.document.getText();
        if (!text.trim()) {
            vscode.window.showWarningMessage('文件内容为空');
            return;
        }

        await contextManager.parseAndStore(text);
        vscode.window.showInformationMessage('对话解析完成');
        contextTreeProvider.refresh();
    } catch (error) {
        console.error('解析对话失败:', error);
        vscode.window.showErrorMessage(`解析失败: ${error}`);
    }
}

async function composeContext() {
    try {
        const items = await contextManager.getRecentContexts(10);

        if (items.length === 0) {
            vscode.window.showInformationMessage('暂无历史上下文，请先解析一些对话内容');
            return;
        }

        const quickPickItems = items.map(item => ({
            label: item.title,
            description: item.timestamp.toLocaleDateString(),
            detail: item.preview,
            item: item
        }));

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: true,
            placeHolder: '选择要组合的上下文片段'
        });

        if (selected && selected.length > 0) {
            const composedText = selected.map(s => s.item.content).join('\n\n---\n\n');

            // 创建新文档显示组合结果
            const doc = await vscode.workspace.openTextDocument({
                content: composedText,
                language: 'markdown'
            });
            vscode.window.showTextDocument(doc);
        }
    } catch (error) {
        console.error('组合上下文失败:', error);
        vscode.window.showErrorMessage(`组合失败: ${error}`);
    }
}

async function handleGetContextHistory(panel: vscode.WebviewPanel) {
    const contexts = await contextManager.getRecentContexts(50);
    panel.webview.postMessage({
        command: 'contextHistory',
        data: contexts
    });
}

async function handleComposeContext(contextIds: string[]) {
    const contexts = await contextManager.getContextsByIds(contextIds);
    const composedText = contexts.map(c => c.content).join('\n\n---\n\n');

    const doc = await vscode.workspace.openTextDocument({
        content: composedText,
        language: 'markdown'
    });
    vscode.window.showTextDocument(doc);
}

async function openContext(contextItem: ContextItem) {
    const doc = await vscode.workspace.openTextDocument({
        content: contextItem.content,
        language: contextItem.type === 'code' ? (contextItem.metadata?.language || 'text') : 'markdown'
    });
    vscode.window.showTextDocument(doc);
}

function getWebviewContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Context Manager</title>
        <style>
            body { font-family: var(--vscode-font-family); }
            .context-item { 
                border: 1px solid var(--vscode-panel-border);
                margin: 8px 0;
                padding: 12px;
                border-radius: 4px;
            }
            .context-title { font-weight: bold; margin-bottom: 4px; }
            .context-preview { color: var(--vscode-descriptionForeground); }
            .selected { background-color: var(--vscode-list-activeSelectionBackground); }
        </style>
    </head>
    <body>
        <h2>上下文历史</h2>
        <div id="contextList"></div>
        <button onclick="composeSelected()">组合选中项</button>
        
        <script>
            const vscode = acquireVsCodeApi();
            let selectedContexts = new Set();
            
            // 请求上下文历史
            vscode.postMessage({ command: 'getContextHistory' });
            
            // 监听消息
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'contextHistory') {
                    renderContextList(message.data);
                }
            });
            
            function renderContextList(contexts) {
                const listEl = document.getElementById('contextList');
                listEl.innerHTML = contexts.map(ctx => 
                    \`<div class="context-item" onclick="toggleSelect('\${ctx.id}')" data-id="\${ctx.id}">
                        <div class="context-title">\${ctx.title}</div>
                        <div class="context-preview">\${ctx.preview}</div>
                    </div>\`
                ).join('');
            }
            
            function toggleSelect(id) {
                const el = document.querySelector(\`[data-id="\${id}"]\`);
                if (selectedContexts.has(id)) {
                    selectedContexts.delete(id);
                    el.classList.remove('selected');
                } else {
                    selectedContexts.add(id);
                    el.classList.add('selected');
                }
            }
            
            function composeSelected() {
                if (selectedContexts.size > 0) {
                    vscode.postMessage({
                        command: 'composeContext',
                        data: Array.from(selectedContexts)
                    });
                }
            }
        </script>
    </body>
    </html>`;
}

export function deactivate() {
    console.log('Vibe Context Manager 插件已停用');
}