import * as vscode from 'vscode';
import { ContextManager } from './core/ContextManager';
import { ChatHistoryParser } from './parsers/ChatHistoryParser';
import { ContextTreeProvider } from './providers/ContextTreeProvider';
import { ChatTreeProvider } from './providers/ChatTreeProvider';
import { DatabaseManager } from './storage/DatabaseManager';
import { ChatManager } from './ai/ChatManager';
import { ContextItem } from './types/ContextTypes';

let contextManager: ContextManager;
let contextTreeProvider: ContextTreeProvider;
let chatManager: ChatManager;
let chatTreeProvider: ChatTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Vibe Context Manager 插件已激活');

    try {
        // 初始化核心组件
        const dbManager = new DatabaseManager(context.globalStorageUri.fsPath);
        const chatParser = new ChatHistoryParser();
        contextManager = new ContextManager(dbManager, chatParser);
        contextTreeProvider = new ContextTreeProvider(contextManager);
        
        // 初始化AI对话组件
        chatManager = new ChatManager(context);
        chatTreeProvider = new ChatTreeProvider(chatManager);

        // 注册树视图
        vscode.window.createTreeView('vibeContextTree', {
            treeDataProvider: contextTreeProvider,
            showCollapseAll: true
        });

        vscode.window.createTreeView('vibeChatTree', {
            treeDataProvider: chatTreeProvider,
            showCollapseAll: true
        });

        // 注册命令
        const commands = [
            vscode.commands.registerCommand('vibeContext.openContextManager', openContextManager),
            vscode.commands.registerCommand('vibeContext.parseCurrentChat', parseCurrentChat),
            vscode.commands.registerCommand('vibeContext.composeContext', composeContext),
            vscode.commands.registerCommand('vibeContext.refreshTree', () => contextTreeProvider.refresh()),
            vscode.commands.registerCommand('vibeContext.openContext', openContext),
            
            // AI 对话命令
            vscode.commands.registerCommand('vibeContext.configureAI', configureAI),
            vscode.commands.registerCommand('vibeContext.openChatInterface', openChatInterface),
            vscode.commands.registerCommand('vibeContext.newChat', newChat),
            vscode.commands.registerCommand('vibeContext.loadChatSession', loadChatSession),
            vscode.commands.registerCommand('vibeContext.deleteChatSession', deleteChatSession),
            vscode.commands.registerCommand('vibeContext.chatWithContext', chatWithContext),
            vscode.commands.registerCommand('vibeContext.refreshChatTree', () => chatTreeProvider.refresh()),
            vscode.commands.registerCommand('vibeContext.showContextStats', showContextStats)
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

        console.log('开始解析文件:', activeEditor.document.fileName);
        console.log('文件内容长度:', text.length);

        await contextManager.parseAndStore(text);
        
        // 获取解析结果统计
        const recentContexts = await contextManager.getRecentContexts(10);
        const newContexts = recentContexts.filter(ctx => 
            Date.now() - ctx.timestamp.getTime() < 5000 // 最近5秒内的
        );
        
        vscode.window.showInformationMessage(
            `解析完成！新增 ${newContexts.length} 个上下文项`
        );
        
        contextTreeProvider.refresh();
        
        // 如果有新内容，显示详情
        if (newContexts.length > 0) {
            console.log('新增上下文:', newContexts.map(c => c.title));
        }
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

// AI 配置函数
async function configureAI() {
    try {
        // 第一步：选择提供商
        const provider = await vscode.window.showQuickPick([
            { 
                label: 'OpenAI', 
                value: 'openai',
                description: '使用 OpenAI GPT 模型',
                detail: '支持 GPT-3.5-turbo, GPT-4 等模型'
            },
            { 
                label: 'Anthropic (Claude)', 
                value: 'anthropic',
                description: '使用 Anthropic Claude 模型',
                detail: '支持 Claude-3 系列模型'
            },
            { 
                label: '自定义 API', 
                value: 'custom',
                description: '使用兼容 OpenAI 格式的自定义 API',
                detail: '需要提供完整的 API 端点地址'
            }
        ], {
            placeHolder: '选择 AI 提供商',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!provider) return;

        let config: any = {
            provider: provider.value,
            temperature: 0.7,
            maxTokens: 2000
        };

        // 根据不同提供商配置不同的参数
        if (provider.value === 'openai') {
            config = await configureOpenAI(config);
        } else if (provider.value === 'anthropic') {
            config = await configureAnthropic(config);
        } else if (provider.value === 'custom') {
            config = await configureCustomAPI(config);
        }

        if (!config) return;

        // 显示配置摘要
        const summary = `配置摘要：
提供商: ${config.provider}
${config.baseUrl ? `API 地址: ${config.baseUrl}` : ''}
模型: ${config.model}
温度: ${config.temperature}
最大 Token: ${config.maxTokens}`;

        const confirm = await vscode.window.showInformationMessage(
            summary + '\n\n确认保存此配置？',
            '保存配置',
            '重新配置'
        );

        if (confirm === '保存配置') {
            await chatManager.initializeAI(config);
            chatTreeProvider.refresh();
        } else if (confirm === '重新配置') {
            await configureAI(); // 递归重新配置
        }

    } catch (error) {
        vscode.window.showErrorMessage(`AI 配置失败: ${error}`);
    }
}

async function configureOpenAI(config: any) {
    // API Key
    const apiKey = await vscode.window.showInputBox({
        prompt: '请输入 OpenAI API Key',
        password: true,
        placeHolder: 'sk-...',
        validateInput: (value) => {
            if (!value) return 'API Key 不能为空';
            if (!value.startsWith('sk-')) return 'OpenAI API Key 应该以 sk- 开头';
            return null;
        }
    });
    if (!apiKey) return null;

    // 自定义 Base URL（可选）
    const useCustomUrl = await vscode.window.showQuickPick([
        { label: '使用默认 API 地址', value: false },
        { label: '使用自定义 API 地址（如代理）', value: true }
    ], {
        placeHolder: '选择 API 地址配置'
    });

    let baseUrl: string | undefined;
    if (useCustomUrl?.value) {
        baseUrl = await vscode.window.showInputBox({
            prompt: '请输入自定义 OpenAI API 地址',
            placeHolder: 'https://your-proxy.com/v1/chat/completions',
            validateInput: (value) => {
                if (!value) return 'API 地址不能为空';
                try {
                    new URL(value);
                    return null;
                } catch {
                    return '请输入有效的 URL 地址';
                }
            }
        });
        if (!baseUrl) return null;
    }

    // 模型选择
    const model = await vscode.window.showQuickPick([
        { label: 'gpt-3.5-turbo', description: '快速、经济的选择' },
        { label: 'gpt-3.5-turbo-16k', description: '支持更长上下文' },
        { label: 'gpt-4', description: '更强大但较慢' },
        { label: 'gpt-4-turbo-preview', description: '最新的 GPT-4 模型' },
        { label: '自定义模型', value: 'custom' }
    ], {
        placeHolder: '选择 OpenAI 模型'
    });
    if (!model) return null;

    let modelName = model.label;
    if (model.value === 'custom') {
        const customModel = await vscode.window.showInputBox({
            prompt: '请输入自定义模型名称',
            placeHolder: 'gpt-4-custom'
        });
        if (!customModel) return null;
        modelName = customModel;
    }

    return {
        ...config,
        apiKey,
        baseUrl,
        model: modelName
    };
}

async function configureAnthropic(config: any) {
    // API Key
    const apiKey = await vscode.window.showInputBox({
        prompt: '请输入 Anthropic API Key',
        password: true,
        placeHolder: 'sk-ant-...',
        validateInput: (value) => {
            if (!value) return 'API Key 不能为空';
            if (!value.startsWith('sk-ant-')) return 'Anthropic API Key 应该以 sk-ant- 开头';
            return null;
        }
    });
    if (!apiKey) return null;

    // 模型选择
    const model = await vscode.window.showQuickPick([
        { label: 'claude-3-haiku-20240307', description: '最快最经济的模型' },
        { label: 'claude-3-sonnet-20240229', description: '平衡性能和速度' },
        { label: 'claude-3-opus-20240229', description: '最强大的模型' },
        { label: '自定义模型', value: 'custom' }
    ], {
        placeHolder: '选择 Claude 模型'
    });
    if (!model) return null;

    let modelName = model.label;
    if (model.value === 'custom') {
        const customModel = await vscode.window.showInputBox({
            prompt: '请输入自定义 Claude 模型名称',
            placeHolder: 'claude-3-custom'
        });
        if (!customModel) return null;
        modelName = customModel;
    }

    return {
        ...config,
        apiKey,
        model: modelName
    };
}

async function configureCustomAPI(config: any) {
    // API 地址（必填）
    const baseUrl = await vscode.window.showInputBox({
        prompt: '请输入完整的 API 端点地址',
        placeHolder: 'https://api.example.com/v1/chat/completions',
        validateInput: (value) => {
            if (!value) return 'API 地址不能为空';
            try {
                const url = new URL(value);
                if (!url.protocol.startsWith('http')) {
                    return '请输入有效的 HTTP/HTTPS 地址';
                }
                return null;
            } catch {
                return '请输入有效的 URL 地址';
            }
        }
    });
    if (!baseUrl) return null;

    // API Key
    const apiKey = await vscode.window.showInputBox({
        prompt: '请输入 API Key',
        password: true,
        placeHolder: '输入您的 API Key',
        validateInput: (value) => {
            if (!value) return 'API Key 不能为空';
            return null;
        }
    });
    if (!apiKey) return null;

    // 模型名称
    const model = await vscode.window.showInputBox({
        prompt: '请输入模型名称',
        placeHolder: 'your-model-name',
        validateInput: (value) => {
            if (!value) return '模型名称不能为空';
            return null;
        }
    });
    if (!model) return null;

    // 高级配置
    const advancedConfig = await vscode.window.showQuickPick([
        { label: '使用默认参数', value: false },
        { label: '自定义高级参数', value: true }
    ], {
        placeHolder: '是否需要自定义高级参数？'
    });

    if (advancedConfig?.value) {
        // 温度设置
        const temperatureStr = await vscode.window.showInputBox({
            prompt: '请输入温度参数 (0.0-2.0)',
            value: '0.7',
            validateInput: (value) => {
                const num = parseFloat(value);
                if (isNaN(num) || num < 0 || num > 2) {
                    return '温度参数应该在 0.0 到 2.0 之间';
                }
                return null;
            }
        });
        if (temperatureStr) {
            config.temperature = parseFloat(temperatureStr);
        }

        // 最大 Token 设置
        const maxTokensStr = await vscode.window.showInputBox({
            prompt: '请输入最大 Token 数量',
            value: '2000',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 32000) {
                    return 'Token 数量应该在 1 到 32000 之间';
                }
                return null;
            }
        });
        if (maxTokensStr) {
            config.maxTokens = parseInt(maxTokensStr);
        }
    }

    return {
        ...config,
        apiKey,
        baseUrl,
        model
    };
}

async function openChatInterface() {
    const panel = vscode.window.createWebviewPanel(
        'vibeChatInterface',
        'AI 对话',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getChatWebviewContent();
    
    // 处理来自webview的消息
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'sendMessage':
                await handleSendMessage(panel, message.text, message.contextIds, message.systemPrompt);
                break;
            case 'getContexts':
                await handleGetContexts(panel);
                break;
            case 'getChatHistory':
                await handleGetChatHistory(panel);
                break;
        }
    });
}

async function handleSendMessage(
    panel: vscode.WebviewPanel, 
    userMessage: string, 
    contextIds: string[] = [],
    systemPrompt?: string
) {
    try {
        // 获取选中的上下文
        const contextItems = await contextManager.getContextsByIds(contextIds);
        
        // 发送消息到AI
        const response = await chatManager.sendMessage(userMessage, contextItems, systemPrompt);
        
        // 返回响应
        panel.webview.postMessage({
            command: 'messageResponse',
            response: response.content,
            usage: response.usage
        });

        // 刷新聊天树
        chatTreeProvider.refresh();
    } catch (error) {
        panel.webview.postMessage({
            command: 'messageError',
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

async function handleGetContexts(panel: vscode.WebviewPanel) {
    const contexts = await contextManager.getRecentContexts(50);
    panel.webview.postMessage({
        command: 'contextsList',
        data: contexts
    });
}

async function handleGetChatHistory(panel: vscode.WebviewPanel) {
    const currentSession = chatManager.getCurrentSession();
    panel.webview.postMessage({
        command: 'chatHistory',
        data: currentSession?.messages || []
    });
}

async function newChat() {
    await chatManager.createNewChat();
    chatTreeProvider.refresh();
}

async function loadChatSession(sessionId: string) {
    await chatManager.loadSession(sessionId);
    chatTreeProvider.refresh();
}

async function deleteChatSession(sessionId: string) {
    const confirm = await vscode.window.showWarningMessage(
        '确定要删除这个对话会话吗？',
        '删除',
        '取消'
    );
    
    if (confirm === '删除') {
        await chatManager.deleteSession(sessionId);
        chatTreeProvider.refresh();
    }
}

async function chatWithContext() {
    try {
        // 选择上下文
        const contexts = await contextManager.getRecentContexts(20);
        if (contexts.length === 0) {
            vscode.window.showInformationMessage('暂无可用上下文，请先解析一些内容');
            return;
        }

        const selectedContexts = await vscode.window.showQuickPick(
            contexts.map(ctx => ({
                label: ctx.title,
                description: ctx.preview,
                picked: false,
                context: ctx
            })),
            {
                canPickMany: true,
                placeHolder: '选择要包含的上下文（可多选）'
            }
        );

        if (!selectedContexts || selectedContexts.length === 0) {
            return;
        }

        // 输入消息
        const userMessage = await vscode.window.showInputBox({
            prompt: '请输入您的问题',
            placeHolder: '基于选中的上下文，您想问什么？'
        });

        if (!userMessage) return;

        // 发送消息
        const contextItems = selectedContexts.map(s => s.context);
        const response = await chatManager.sendMessage(userMessage, contextItems);
        
        // 显示结果
        const doc = await vscode.workspace.openTextDocument({
            content: `# 问题\n${userMessage}\n\n# 回答\n${response.content}\n\n# 使用的上下文\n${contextItems.map(c => `- ${c.title}`).join('\n')}`,
            language: 'markdown'
        });
        vscode.window.showTextDocument(doc);

        chatTreeProvider.refresh();
    } catch (error) {
        vscode.window.showErrorMessage(`对话失败: ${error}`);
    }
}

function getChatWebviewContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI 对话</title>
        <style>
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            .chat-container { max-width: 800px; margin: 0 auto; }
            .message { 
                margin: 10px 0; 
                padding: 12px; 
                border-radius: 8px; 
                border-left: 4px solid var(--vscode-activityBarBadge-background);
            }
            .user-message { 
                background: var(--vscode-input-background);
                border-left-color: var(--vscode-charts-blue);
            }
            .assistant-message { 
                background: var(--vscode-textBlockQuote-background);
                border-left-color: var(--vscode-charts-green);
            }
            .input-area { 
                position: fixed; 
                bottom: 20px; 
                left: 20px; 
                right: 20px; 
                background: var(--vscode-editor-background);
                padding: 15px;
                border-top: 1px solid var(--vscode-panel-border);
            }
            .input-row { display: flex; gap: 10px; margin-bottom: 10px; }
            #messageInput { 
                flex: 1; 
                padding: 8px; 
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
            }
            button { 
                padding: 8px 16px; 
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                cursor: pointer;
            }
            button:hover { background: var(--vscode-button-hoverBackground); }
            .context-selector { margin-bottom: 10px; }
            .context-item { 
                display: inline-block; 
                margin: 2px; 
                padding: 4px 8px; 
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            }
            .context-item.selected { background: var(--vscode-list-activeSelectionBackground); }
            .system-prompt { 
                width: 100%; 
                height: 60px; 
                margin-bottom: 10px;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
            }
            .loading { opacity: 0.6; }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <h2>🤖 AI 对话助手</h2>
            <div id="chatHistory"></div>
        </div>
        
        <div class="input-area">
            <div class="context-selector">
                <strong>选择上下文:</strong>
                <div id="contextList"></div>
            </div>
            
            <textarea id="systemPrompt" class="system-prompt" placeholder="系统提示词（可选）..."></textarea>
            
            <div class="input-row">
                <input type="text" id="messageInput" placeholder="输入您的消息..." />
                <button onclick="sendMessage()">发送</button>
                <button onclick="clearChat()">清空</button>
            </div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            let selectedContexts = new Set();
            let isLoading = false;
            
            // 初始化
            vscode.postMessage({ command: 'getContexts' });
            vscode.postMessage({ command: 'getChatHistory' });
            
            // 监听消息
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'contextsList':
                        renderContextList(message.data);
                        break;
                    case 'chatHistory':
                        renderChatHistory(message.data);
                        break;
                    case 'messageResponse':
                        handleMessageResponse(message.response, message.usage);
                        break;
                    case 'messageError':
                        handleMessageError(message.error);
                        break;
                }
            });
            
            function renderContextList(contexts) {
                const listEl = document.getElementById('contextList');
                listEl.innerHTML = contexts.map(ctx => 
                    \`<span class="context-item" onclick="toggleContext('\${ctx.id}')" data-id="\${ctx.id}">
                        \${ctx.title}
                    </span>\`
                ).join('');
            }
            
            function toggleContext(id) {
                const el = document.querySelector(\`[data-id="\${id}"]\`);
                if (selectedContexts.has(id)) {
                    selectedContexts.delete(id);
                    el.classList.remove('selected');
                } else {
                    selectedContexts.add(id);
                    el.classList.add('selected');
                }
            }
            
            function renderChatHistory(messages) {
                const historyEl = document.getElementById('chatHistory');
                historyEl.innerHTML = messages.map(msg => 
                    \`<div class="message \${msg.role}-message">
                        <strong>\${msg.role === 'user' ? '👤 您' : '🤖 助手'}:</strong><br>
                        \${msg.content.replace(/\\n/g, '<br>')}
                    </div>\`
                ).join('');
                historyEl.scrollTop = historyEl.scrollHeight;
            }
            
            function sendMessage() {
                if (isLoading) return;
                
                const messageInput = document.getElementById('messageInput');
                const systemPrompt = document.getElementById('systemPrompt');
                const text = messageInput.value.trim();
                
                if (!text) return;
                
                isLoading = true;
                document.body.classList.add('loading');
                
                // 添加用户消息到界面
                const historyEl = document.getElementById('chatHistory');
                historyEl.innerHTML += \`<div class="message user-message">
                    <strong>👤 您:</strong><br>\${text.replace(/\\n/g, '<br>')}
                </div>\`;
                
                vscode.postMessage({
                    command: 'sendMessage',
                    text: text,
                    contextIds: Array.from(selectedContexts),
                    systemPrompt: systemPrompt.value.trim() || undefined
                });
                
                messageInput.value = '';
            }
            
            function handleMessageResponse(response, usage) {
                isLoading = false;
                document.body.classList.remove('loading');
                
                const historyEl = document.getElementById('chatHistory');
                historyEl.innerHTML += \`<div class="message assistant-message">
                    <strong>🤖 助手:</strong><br>\${response.replace(/\\n/g, '<br>')}
                    \${usage ? \`<br><small>Token 使用: \${usage.totalTokens}</small>\` : ''}
                </div>\`;
                historyEl.scrollTop = historyEl.scrollHeight;
            }
            
            function handleMessageError(error) {
                isLoading = false;
                document.body.classList.remove('loading');
                
                const historyEl = document.getElementById('chatHistory');
                historyEl.innerHTML += \`<div class="message assistant-message" style="border-left-color: var(--vscode-charts-red);">
                    <strong>❌ 错误:</strong><br>\${error}
                </div>\`;
            }
            
            function clearChat() {
                document.getElementById('chatHistory').innerHTML = '';
            }
            
            // 回车发送
            document.getElementById('messageInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        </script>
    </body>
    </html>`;
}

async function showContextStats() {
    try {
        const allContexts = await contextManager.getRecentContexts(1000);
        const stats = {
            total: allContexts.length,
            code: allContexts.filter(c => c.type === 'code').length,
            json: allContexts.filter(c => c.type === 'json').length,
            qa: allContexts.filter(c => c.type === 'qa').length
        };

        const message = `上下文统计信息：
总计: ${stats.total} 个
代码块: ${stats.code} 个
JSON数据: ${stats.json} 个
问答对: ${stats.qa} 个

最近的5个项目：
${allContexts.slice(0, 5).map(c => `- ${c.title} (${c.type})`).join('\n')}`;

        vscode.window.showInformationMessage(message, { modal: true });
    } catch (error) {
        vscode.window.showErrorMessage(`获取统计信息失败: ${error}`);
    }
}

export function deactivate() {
    console.log('Vibe Context Manager 插件已停用');
}