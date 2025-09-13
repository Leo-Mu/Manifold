import * as vscode from 'vscode';
import { ContextManager } from './core/ContextManager';
import { ChatHistoryParser } from './parsers/ChatHistoryParser';
import { ContextTreeProvider } from './providers/ContextTreeProvider';
import { ChatTreeProvider } from './providers/ChatTreeProvider';
import { AIConfigTreeProvider } from './providers/AIConfigTreeProvider';
import { DatabaseManager } from './storage/DatabaseManager';
import { ChatManager } from './ai/ChatManager';
import { ContextItem } from './types/ContextTypes';

let contextManager: ContextManager;
let contextTreeProvider: ContextTreeProvider;
let chatManager: ChatManager;
let chatTreeProvider: ChatTreeProvider;
let aiConfigTreeProvider: AIConfigTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Vibe Context Manager 插件已激活');

    try {
        // 初始化核心组件
        const dbManager = new DatabaseManager(context.globalStorageUri.fsPath);
        const chatParser = new ChatHistoryParser();

        // 初始化AI对话组件
        chatManager = new ChatManager(context);
        chatTreeProvider = new ChatTreeProvider(chatManager);
        aiConfigTreeProvider = new AIConfigTreeProvider(chatManager.getConfigManager());

        // 初始化上下文管理器（如果有AI配置则启用智能模式）
        const activeConfig = chatManager.getCurrentConfig();
        if (activeConfig && activeConfig.apiKey) {
            console.log('检测到AI配置，启用智能上下文管理');
            const aiProvider = chatManager['aiProvider']; // 获取AI提供商实例
            if (aiProvider) {
                contextManager = new ContextManager(dbManager, chatParser, aiProvider);
            } else {
                contextManager = new ContextManager(dbManager, chatParser);
            }
        } else {
            console.log('未检测到AI配置，使用传统上下文管理');
            contextManager = new ContextManager(dbManager, chatParser);
        }
        
        contextTreeProvider = new ContextTreeProvider(contextManager);

        // 注册树视图
        vscode.window.createTreeView('vibeContextTree', {
            treeDataProvider: contextTreeProvider,
            showCollapseAll: true
        });

        vscode.window.createTreeView('vibeChatTree', {
            treeDataProvider: chatTreeProvider,
            showCollapseAll: true
        });

        vscode.window.createTreeView('vibeAIConfigTree', {
            treeDataProvider: aiConfigTreeProvider,
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
            vscode.commands.registerCommand('vibeContext.showContextStats', showContextStats),

            // AI 配置管理命令
            vscode.commands.registerCommand('vibeContext.switchAIConfig', switchAIConfig),
            vscode.commands.registerCommand('vibeContext.deleteAIConfig', deleteAIConfig),
            vscode.commands.registerCommand('vibeContext.renameAIConfig', renameAIConfig),
            vscode.commands.registerCommand('vibeContext.editAIConfig', editAIConfig),
            vscode.commands.registerCommand('vibeContext.exportAIConfigs', exportAIConfigs),
            vscode.commands.registerCommand('vibeContext.importAIConfigs', importAIConfigs),
            vscode.commands.registerCommand('vibeContext.refreshAIConfigTree', () => aiConfigTreeProvider.refresh()),

            // 智能功能命令
            vscode.commands.registerCommand('vibeContext.getIntelligentRecommendations', getIntelligentRecommendations),
            vscode.commands.registerCommand('vibeContext.analyzeRelationships', analyzeRelationships),
            vscode.commands.registerCommand('vibeContext.showProcessingStats', showProcessingStats),
            vscode.commands.registerCommand('vibeContext.enableIntelligentMode', enableIntelligentMode)
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
            // 询问配置名称
            const configName = await vscode.window.showInputBox({
                prompt: '请为此配置输入一个名称',
                placeHolder: `${config.provider}-${config.model}`,
                validateInput: (value) => {
                    if (!value) return '配置名称不能为空';
                    const existingConfigs = chatManager.getAllConfigs();
                    if (existingConfigs.some(c => c.name === value)) {
                        return '配置名称已存在，将会覆盖现有配置';
                    }
                    return null;
                }
            });

            if (configName) {
                await chatManager.initializeAI(config, configName);
                chatTreeProvider.refresh();
                aiConfigTreeProvider.refresh();
            }
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

        // 发送流式消息到AI
        await chatManager.sendMessageStream(
            userMessage,
            (chunk) => {
                // 发送流式数据块到前端
                panel.webview.postMessage({
                    command: 'streamChunk',
                    content: chunk.content,
                    finished: chunk.finished,
                    usage: chunk.usage
                });
            },
            contextItems,
            systemPrompt
        );

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
            * {
                box-sizing: border-box;
            }
            
            html, body { 
                height: 100%;
                margin: 0;
                padding: 0;
                font-family: var(--vscode-font-family); 
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                overflow: hidden;
            }
            
            .chat-layout {
                display: flex;
                flex-direction: column;
                height: 100vh;
                max-width: 800px;
                margin: 0 auto;
            }
            
            .chat-header {
                flex-shrink: 0;
                padding: 15px 20px 10px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .chat-header h2 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            
            .chat-history-container {
                flex: 1;
                overflow-y: auto;
                padding: 15px 20px;
                scroll-behavior: smooth;
            }
            
            .message { 
                margin: 15px 0; 
                padding: 12px 16px; 
                border-radius: 8px; 
                border-left: 4px solid var(--vscode-activityBarBadge-background);
                word-wrap: break-word;
                line-height: 1.5;
            }
            
            .user-message { 
                background: var(--vscode-input-background);
                border-left-color: var(--vscode-charts-blue);
                margin-left: 20px;
            }
            
            .assistant-message { 
                background: var(--vscode-textBlockQuote-background);
                border-left-color: var(--vscode-charts-green);
                margin-right: 20px;
            }
            
            .message strong {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
            }
            
            .input-area { 
                flex-shrink: 0;
                background: var(--vscode-editor-background);
                padding: 15px 20px;
                border-top: 1px solid var(--vscode-panel-border);
                box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
            }
            
            .context-selector { 
                margin-bottom: 12px; 
            }
            
            .context-selector strong {
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                color: var(--vscode-descriptionForeground);
            }
            
            .context-list {
                max-height: 80px;
                overflow-y: auto;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 8px;
                background: var(--vscode-input-background);
            }
            
            .context-item { 
                display: inline-block; 
                margin: 2px; 
                padding: 4px 8px; 
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 12px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
            }
            
            .context-item:hover {
                background: var(--vscode-list-hoverBackground);
            }
            
            .context-item.selected { 
                background: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
            }
            
            .system-prompt { 
                width: 100%; 
                height: 60px; 
                margin-bottom: 12px;
                padding: 8px 12px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-family: var(--vscode-font-family);
                font-size: 13px;
                resize: vertical;
                min-height: 40px;
                max-height: 120px;
            }
            
            .system-prompt:focus {
                outline: 1px solid var(--vscode-focusBorder);
                border-color: var(--vscode-focusBorder);
            }
            
            .input-row { 
                display: flex; 
                gap: 10px; 
                align-items: flex-end;
            }
            
            #messageInput { 
                flex: 1; 
                padding: 10px 12px; 
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-family: var(--vscode-font-family);
                font-size: 14px;
                min-height: 40px;
                resize: none;
            }
            
            #messageInput:focus {
                outline: 1px solid var(--vscode-focusBorder);
                border-color: var(--vscode-focusBorder);
            }
            
            button { 
                padding: 10px 16px; 
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-family: var(--vscode-font-family);
                font-size: 13px;
                font-weight: 500;
                transition: background-color 0.2s ease;
                min-height: 40px;
            }
            
            button:hover { 
                background: var(--vscode-button-hoverBackground); 
            }
            
            button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            .loading { 
                opacity: 0.7; 
            }
            
            .loading .input-area {
                pointer-events: none;
            }
            
            /* 滚动条样式 */
            .chat-history-container::-webkit-scrollbar,
            .context-list::-webkit-scrollbar {
                width: 8px;
            }
            
            .chat-history-container::-webkit-scrollbar-track,
            .context-list::-webkit-scrollbar-track {
                background: var(--vscode-scrollbarSlider-background);
            }
            
            .chat-history-container::-webkit-scrollbar-thumb,
            .context-list::-webkit-scrollbar-thumb {
                background: var(--vscode-scrollbarSlider-hoverBackground);
                border-radius: 4px;
            }
            
            /* 空状态样式 */
            .empty-state {
                text-align: center;
                padding: 40px 20px;
                color: var(--vscode-descriptionForeground);
            }
            
            .empty-state h3 {
                margin: 0 0 10px;
                font-size: 16px;
                font-weight: 500;
            }
            
            .empty-state p {
                margin: 0;
                font-size: 13px;
                line-height: 1.4;
            }
            
            /* 流式消息样式 */
            .stream-message {
                position: relative;
            }
            
            .stream-message::after {
                content: '▋';
                color: var(--vscode-charts-green);
                animation: blink 1s infinite;
                margin-left: 2px;
            }
            
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
            
            .stream-content {
                min-height: 1.2em;
            }
        </style>
    </head>
    <body>
        <div class="chat-layout">
            <div class="chat-header">
                <h2>🤖 AI 对话助手</h2>
            </div>
            
            <div class="chat-history-container">
                <div id="chatHistory">
                    <div class="empty-state">
                        <h3>开始新的对话</h3>
                        <p>选择上下文并输入您的问题，AI 助手将为您提供帮助</p>
                    </div>
                </div>
            </div>
            
            <div class="input-area">
                <div class="context-selector">
                    <strong>选择上下文</strong>
                    <div class="context-list" id="contextList">
                        <div style="color: var(--vscode-descriptionForeground); font-size: 12px; padding: 4px;">
                            正在加载上下文...
                        </div>
                    </div>
                </div>
                
                <textarea id="systemPrompt" class="system-prompt" placeholder="系统提示词（可选）..."></textarea>
                
                <div class="input-row">
                    <textarea id="messageInput" placeholder="输入您的消息..." rows="1"></textarea>
                    <button id="sendButton" onclick="sendMessage()">发送</button>
                    <button onclick="clearChat()">清空</button>
                </div>
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
                    case 'streamChunk':
                        handleStreamChunk(message.content, message.finished, message.usage);
                        break;
                    case 'messageError':
                        handleMessageError(message.error);
                        break;
                }
            });
            
            function renderContextList(contexts) {
                const listEl = document.getElementById('contextList');
                if (contexts.length === 0) {
                    listEl.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-size: 12px; padding: 4px;">暂无可用上下文</div>';
                    return;
                }
                
                listEl.innerHTML = contexts.map(ctx => 
                    \`<span class="context-item" onclick="toggleContext('\${ctx.id}')" data-id="\${ctx.id}" title="\${ctx.preview || ctx.content.substring(0, 100)}...">
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
                const container = historyEl.parentElement;
                
                if (messages.length === 0) {
                    historyEl.innerHTML = \`
                        <div class="empty-state">
                            <h3>开始新的对话</h3>
                            <p>选择上下文并输入您的问题，AI 助手将为您提供帮助</p>
                        </div>
                    \`;
                    return;
                }
                
                historyEl.innerHTML = messages.map(msg => 
                    \`<div class="message \${msg.role}-message">
                        <strong>\${msg.role === 'user' ? '👤 您' : '🤖 助手'}</strong>
                        <div>\${formatMessageContent(msg.content)}</div>
                    </div>\`
                ).join('');
                
                // 滚动到底部
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 100);
            }
            
            function formatMessageContent(content) {
                // 处理代码块
                content = content.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre style="background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 8px 0;"><code>$1</code></pre>');
                
                // 处理行内代码
                content = content.replace(/\`([^\`]+)\`/g, '<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family);">$1</code>');
                
                // 处理换行
                content = content.replace(/\\\\n/g, '<br>');
                
                return content;
            }
            
            function sendMessage() {
                if (isLoading) return;
                
                const messageInput = document.getElementById('messageInput');
                const systemPrompt = document.getElementById('systemPrompt');
                const sendButton = document.getElementById('sendButton');
                const text = messageInput.value.trim();
                
                if (!text) return;
                
                isLoading = true;
                document.body.classList.add('loading');
                sendButton.disabled = true;
                sendButton.textContent = '发送中...';
                
                // 清除空状态并添加用户消息到界面
                const historyEl = document.getElementById('chatHistory');
                const container = historyEl.parentElement;
                
                // 如果是第一条消息，清除空状态
                if (historyEl.querySelector('.empty-state')) {
                    historyEl.innerHTML = '';
                }
                
                historyEl.innerHTML += \`<div class="message user-message">
                    <strong>👤 您</strong>
                    <div>\${formatMessageContent(text)}</div>
                </div>\`;
                
                // 添加加载指示器
                historyEl.innerHTML += \`<div class="message assistant-message loading-message">
                    <strong>🤖 助手</strong>
                    <div>正在思考中...</div>
                </div>\`;
                
                // 滚动到底部
                container.scrollTop = container.scrollHeight;
                
                vscode.postMessage({
                    command: 'sendMessage',
                    text: text,
                    contextIds: Array.from(selectedContexts),
                    systemPrompt: systemPrompt.value.trim() || undefined
                });
                
                messageInput.value = '';
                adjustTextareaHeight(messageInput);
            }
            
            let currentStreamMessage = null;
            
            function handleStreamChunk(content, finished, usage) {
                const historyEl = document.getElementById('chatHistory');
                const container = historyEl.parentElement;
                
                if (!currentStreamMessage) {
                    // 移除加载指示器
                    const loadingMessage = historyEl.querySelector('.loading-message');
                    if (loadingMessage) {
                        loadingMessage.remove();
                    }
                    
                    // 创建新的流式消息容器
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message assistant-message stream-message';
                    messageDiv.innerHTML = \`
                        <strong>🤖 助手</strong>
                        <div class="stream-content"></div>
                        <div class="stream-usage" style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); display: none;"></div>
                    \`;
                    historyEl.appendChild(messageDiv);
                    currentStreamMessage = messageDiv;
                }
                
                if (content) {
                    // 添加新内容到流式消息
                    const contentEl = currentStreamMessage.querySelector('.stream-content');
                    const currentContent = contentEl.textContent || '';
                    const newContent = currentContent + content;
                    contentEl.innerHTML = formatMessageContent(newContent);
                }
                
                if (finished) {
                    // 流式输出完成
                    isLoading = false;
                    document.body.classList.remove('loading');
                    
                    const sendButton = document.getElementById('sendButton');
                    sendButton.disabled = false;
                    sendButton.textContent = '发送';
                    
                    // 显示使用统计
                    if (usage) {
                        const usageEl = currentStreamMessage.querySelector('.stream-usage');
                        usageEl.textContent = \`Token 使用: \${usage.totalTokens}\`;
                        usageEl.style.display = 'block';
                    }
                    
                    // 移除流式标记
                    currentStreamMessage.classList.remove('stream-message');
                    currentStreamMessage = null;
                }
                
                // 滚动到底部
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 10);
            }
            
            function handleMessageResponse(response, usage) {
                // 这个函数现在主要用于非流式响应的兼容性
                isLoading = false;
                document.body.classList.remove('loading');
                
                const sendButton = document.getElementById('sendButton');
                sendButton.disabled = false;
                sendButton.textContent = '发送';
                
                const historyEl = document.getElementById('chatHistory');
                const container = historyEl.parentElement;
                
                // 移除加载指示器
                const loadingMessage = historyEl.querySelector('.loading-message');
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                
                // 添加助手回复
                historyEl.innerHTML += \`<div class="message assistant-message">
                    <strong>🤖 助手</strong>
                    <div>\${formatMessageContent(response)}</div>
                    \${usage ? \`<div style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">Token 使用: \${usage.totalTokens}</div>\` : ''}
                </div>\`;
                
                // 滚动到底部
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 100);
            }
            
            function handleMessageError(error) {
                isLoading = false;
                document.body.classList.remove('loading');
                
                const sendButton = document.getElementById('sendButton');
                sendButton.disabled = false;
                sendButton.textContent = '发送';
                
                const historyEl = document.getElementById('chatHistory');
                const container = historyEl.parentElement;
                
                // 移除加载指示器或流式消息
                const loadingMessage = historyEl.querySelector('.loading-message');
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                
                // 如果有未完成的流式消息，也要清理
                if (currentStreamMessage) {
                    currentStreamMessage.remove();
                    currentStreamMessage = null;
                }
                
                // 添加错误消息
                historyEl.innerHTML += \`<div class="message assistant-message" style="border-left-color: var(--vscode-charts-red);">
                    <strong>❌ 错误</strong>
                    <div>\${error}</div>
                </div>\`;
                
                // 滚动到底部
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 100);
            }
            
            function clearChat() {
                const historyEl = document.getElementById('chatHistory');
                historyEl.innerHTML = \`
                    <div class="empty-state">
                        <h3>开始新的对话</h3>
                        <p>选择上下文并输入您的问题，AI 助手将为您提供帮助</p>
                    </div>
                \`;
            }
            
            function adjustTextareaHeight(textarea) {
                textarea.style.height = 'auto';
                const maxHeight = 120; // 最大高度
                const newHeight = Math.min(textarea.scrollHeight, maxHeight);
                textarea.style.height = newHeight + 'px';
            }
            
            // 设置输入框事件
            const messageInput = document.getElementById('messageInput');
            
            // 回车发送，Shift+回车换行
            messageInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                } else if (e.key === 'Enter' && e.shiftKey) {
                    // 允许换行，调整高度
                    setTimeout(() => adjustTextareaHeight(this), 0);
                }
            });
            
            // 输入时自动调整高度
            messageInput.addEventListener('input', function() {
                adjustTextareaHeight(this);
            });
            
            // 初始化输入框高度
            adjustTextareaHeight(messageInput);
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

// AI 配置管理函数
async function switchAIConfig(configId: string) {
    try {
        const success = await chatManager.switchToConfig(configId);
        if (success) {
            aiConfigTreeProvider.refresh();
            chatTreeProvider.refresh();
        }
    } catch (error) {
        vscode.window.showErrorMessage(`切换配置失败: ${error}`);
    }
}

async function deleteAIConfig(configId: string) {
    try {
        const config = chatManager.getConfigManager().getConfigById(configId);
        if (!config) return;

        const confirm = await vscode.window.showWarningMessage(
            `确定要删除配置 "${config.name}" 吗？`,
            '删除',
            '取消'
        );

        if (confirm === '删除') {
            await chatManager.getConfigManager().deleteConfig(configId);
            aiConfigTreeProvider.refresh();
            vscode.window.showInformationMessage(`配置 "${config.name}" 已删除`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`删除配置失败: ${error}`);
    }
}

async function renameAIConfig(configId: string) {
    try {
        const config = chatManager.getConfigManager().getConfigById(configId);
        if (!config) return;

        const newName = await vscode.window.showInputBox({
            prompt: '请输入新的配置名称',
            value: config.name,
            validateInput: (value) => {
                if (!value) return '配置名称不能为空';
                const existingConfigs = chatManager.getAllConfigs();
                if (existingConfigs.some(c => c.name === value && c.id !== configId)) {
                    return '配置名称已存在';
                }
                return null;
            }
        });

        if (newName && newName !== config.name) {
            await chatManager.getConfigManager().renameConfig(configId, newName);
            aiConfigTreeProvider.refresh();
            vscode.window.showInformationMessage(`配置已重命名为 "${newName}"`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`重命名配置失败: ${error}`);
    }
}

async function editAIConfig(configId: string) {
    try {
        const config = chatManager.getConfigManager().getConfigById(configId);
        if (!config) return;

        // 显示编辑选项
        const action = await vscode.window.showQuickPick([
            { label: '更新 API Key', value: 'apiKey' },
            { label: '更改模型', value: 'model' },
            { label: '修改 API 地址', value: 'baseUrl' },
            { label: '调整参数', value: 'params' }
        ], {
            placeHolder: '选择要编辑的内容'
        });

        if (!action) return;

        let updated = false;

        switch (action.value) {
            case 'apiKey':
                const newApiKey = await vscode.window.showInputBox({
                    prompt: '请输入新的 API Key',
                    password: true,
                    placeHolder: '输入新的 API Key'
                });
                if (newApiKey) {
                    await chatManager.getConfigManager().updateConfig(configId, { apiKey: newApiKey });
                    updated = true;
                }
                break;

            case 'model':
                const newModel = await vscode.window.showInputBox({
                    prompt: '请输入新的模型名称',
                    value: config.model,
                    placeHolder: '模型名称'
                });
                if (newModel && newModel !== config.model) {
                    await chatManager.getConfigManager().updateConfig(configId, { model: newModel });
                    updated = true;
                }
                break;

            case 'baseUrl':
                const newBaseUrl = await vscode.window.showInputBox({
                    prompt: '请输入新的 API 地址',
                    value: config.baseUrl || '',
                    placeHolder: 'https://api.example.com/v1/chat/completions'
                });
                if (newBaseUrl !== config.baseUrl) {
                    await chatManager.getConfigManager().updateConfig(configId, { baseUrl: newBaseUrl || undefined });
                    updated = true;
                }
                break;

            case 'params':
                // 编辑温度和最大Token
                const tempStr = await vscode.window.showInputBox({
                    prompt: '请输入温度参数 (0.0-2.0)',
                    value: config.temperature?.toString() || '0.7',
                    validateInput: (value) => {
                        const num = parseFloat(value);
                        if (isNaN(num) || num < 0 || num > 2) {
                            return '温度参数应该在 0.0 到 2.0 之间';
                        }
                        return null;
                    }
                });

                if (tempStr) {
                    const maxTokensStr = await vscode.window.showInputBox({
                        prompt: '请输入最大 Token 数量',
                        value: config.maxTokens?.toString() || '2000',
                        validateInput: (value) => {
                            const num = parseInt(value);
                            if (isNaN(num) || num < 1 || num > 32000) {
                                return 'Token 数量应该在 1 到 32000 之间';
                            }
                            return null;
                        }
                    });

                    if (maxTokensStr) {
                        await chatManager.getConfigManager().updateConfig(configId, {
                            temperature: parseFloat(tempStr),
                            maxTokens: parseInt(maxTokensStr)
                        });
                        updated = true;
                    }
                }
                break;
        }

        if (updated) {
            aiConfigTreeProvider.refresh();
            vscode.window.showInformationMessage('配置已更新');

            // 如果是当前激活的配置，重新初始化
            const activeConfig = chatManager.getCurrentConfig();
            if (activeConfig?.id === configId) {
                await switchAIConfig(configId);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`编辑配置失败: ${error}`);
    }
}

async function exportAIConfigs() {
    try {
        const configs = chatManager.getConfigManager().exportConfigs();
        if (configs.length === 0) {
            vscode.window.showInformationMessage('没有可导出的配置');
            return;
        }

        const content = JSON.stringify(configs, null, 2);
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'json'
        });

        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`已导出 ${configs.length} 个配置（不包含 API Key）`);
    } catch (error) {
        vscode.window.showErrorMessage(`导出配置失败: ${error}`);
    }
}

async function importAIConfigs() {
    try {
        const input = await vscode.window.showInputBox({
            prompt: '请粘贴配置 JSON 内容',
            placeHolder: '粘贴从导出功能获得的 JSON 配置...'
        });

        if (!input) return;

        const configs = JSON.parse(input);
        if (!Array.isArray(configs)) {
            throw new Error('配置格式不正确，应该是数组格式');
        }

        const importedCount = await chatManager.getConfigManager().importConfigs(configs);

        if (importedCount > 0) {
            aiConfigTreeProvider.refresh();
            vscode.window.showInformationMessage(`成功导入 ${importedCount} 个配置，请为每个配置重新设置 API Key`);
        } else {
            vscode.window.showWarningMessage('没有有效的配置可导入');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`导入配置失败: ${error}`);
    }
}

// 智能功能函数
async function getIntelligentRecommendations() {
    try {
        if (!contextManager.isIntelligentModeEnabled()) {
            vscode.window.showWarningMessage('智能模式未启用，请先配置AI提供商');
            return;
        }

        const query = await vscode.window.showInputBox({
            prompt: '请输入查询内容（可选）',
            placeHolder: '留空将基于当前上下文推荐'
        });

        const recommendations = await contextManager.getIntelligentRecommendations(query, undefined, 10);
        
        if (recommendations && recommendations.items.length > 0) {
            const panel = vscode.window.createWebviewPanel(
                'intelligentRecommendations',
                '智能推荐',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = getRecommendationsWebviewContent(recommendations);
        } else {
            vscode.window.showInformationMessage('未找到相关推荐内容');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`获取智能推荐失败: ${error}`);
    }
}

async function analyzeRelationships() {
    try {
        if (!contextManager.isIntelligentModeEnabled()) {
            vscode.window.showWarningMessage('智能模式未启用，请先配置AI提供商');
            return;
        }

        const recentContexts = await contextManager.getRecentContexts(20);
        if (recentContexts.length < 2) {
            vscode.window.showInformationMessage('需要至少2个上下文项才能分析关系');
            return;
        }

        const selectedItems = await vscode.window.showQuickPick(
            recentContexts.map(item => ({
                label: item.title,
                description: item.preview,
                picked: false,
                item: item
            })),
            {
                canPickMany: true,
                placeHolder: '选择要分析关系的上下文项（至少选择2个）'
            }
        );

        if (!selectedItems || selectedItems.length < 2) {
            vscode.window.showWarningMessage('请至少选择2个上下文项');
            return;
        }

        const itemIds = selectedItems.map(s => s.item.id);
        const networkData = await contextManager.analyzeRelationshipNetwork(itemIds);

        if (networkData) {
            const panel = vscode.window.createWebviewPanel(
                'relationshipNetwork',
                '关系网络分析',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = getNetworkWebviewContent(networkData);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`关系分析失败: ${error}`);
    }
}

async function showProcessingStats() {
    try {
        const stats = contextManager.getProcessingStats();
        
        const panel = vscode.window.createWebviewPanel(
            'processingStats',
            '处理统计信息',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getStatsWebviewContent(stats);
    } catch (error) {
        vscode.window.showErrorMessage(`获取统计信息失败: ${error}`);
    }
}

async function enableIntelligentMode() {
    try {
        const currentConfig = chatManager.getCurrentConfig();
        if (currentConfig && currentConfig.apiKey) {
            vscode.window.showInformationMessage('智能模式已启用');
            return;
        }

        const action = await vscode.window.showInformationMessage(
            '智能模式需要配置AI提供商。是否现在配置？',
            '配置AI',
            '取消'
        );

        if (action === '配置AI') {
            await configureAI();
            
            // 重新初始化上下文管理器
            const newConfig = chatManager.getCurrentConfig();
            if (newConfig && newConfig.apiKey) {
                const aiProvider = chatManager['aiProvider'];
                const dbManager = new DatabaseManager(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
                const chatParser = new ChatHistoryParser();
                if (aiProvider) {
                    contextManager = new ContextManager(dbManager, chatParser, aiProvider);
                } else {
                    contextManager = new ContextManager(dbManager, chatParser);
                }
                contextTreeProvider = new ContextTreeProvider(contextManager);
                
                vscode.window.showInformationMessage('智能模式已启用！');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`启用智能模式失败: ${error}`);
    }
}

function getRecommendationsWebviewContent(recommendations: any): string {
    const itemsHtml = recommendations.items.map((item: any) => `
        <div class="recommendation-item">
            <h3>${item.item.title}</h3>
            <p class="score">相关度: ${(item.score * 100).toFixed(1)}%</p>
            <p class="preview">${item.item.preview}</p>
            <div class="reasons">
                <strong>推荐原因:</strong>
                <ul>
                    ${item.reasons.map((reason: any) => `<li>${reason.description}</li>`).join('')}
                </ul>
            </div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>智能推荐</title>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            .recommendation-item { 
                border: 1px solid var(--vscode-panel-border);
                margin: 15px 0;
                padding: 15px;
                border-radius: 5px;
            }
            .score { color: var(--vscode-charts-blue); font-weight: bold; }
            .preview { color: var(--vscode-descriptionForeground); }
            .reasons { margin-top: 10px; }
            .reasons ul { margin: 5px 0; }
        </style>
    </head>
    <body>
        <h1>智能推荐结果</h1>
        <p><strong>推荐策略:</strong> ${recommendations.strategy}</p>
        <p><strong>整体置信度:</strong> ${(recommendations.confidence * 100).toFixed(1)}%</p>
        <p><strong>说明:</strong> ${recommendations.explanation}</p>
        <hr>
        ${itemsHtml}
    </body>
    </html>`;
}

function getNetworkWebviewContent(networkData: any): string {
    const nodesHtml = networkData.nodes.map((node: any) => `
        <div class="node-item">
            <span class="node-label">${node.label}</span>
            <span class="node-type">(${node.type})</span>
        </div>
    `).join('');

    const edgesHtml = networkData.edges.map((edge: any) => `
        <div class="edge-item">
            <span>${edge.source} → ${edge.target}</span>
            <span class="edge-weight">${(edge.weight * 100).toFixed(1)}%</span>
            <span class="edge-type">(${edge.type})</span>
        </div>
    `).join('');

    const insightsHtml = networkData.insights.map((insight: string) => `
        <li>${insight}</li>
    `).join('');

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>关系网络分析</title>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            .section { margin: 20px 0; }
            .node-item, .edge-item { 
                padding: 5px 10px;
                margin: 5px 0;
                background: var(--vscode-input-background);
                border-radius: 3px;
            }
            .node-type, .edge-type { color: var(--vscode-descriptionForeground); }
            .edge-weight { color: var(--vscode-charts-green); font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>关系网络分析</h1>
        
        <div class="section">
            <h2>网络节点 (${networkData.nodes.length})</h2>
            ${nodesHtml}
        </div>
        
        <div class="section">
            <h2>关系连接 (${networkData.edges.length})</h2>
            ${edgesHtml}
        </div>
        
        <div class="section">
            <h2>分析洞察</h2>
            <ul>${insightsHtml}</ul>
        </div>
    </body>
    </html>`;
}

function getStatsWebviewContent(stats: any): string {
    if (!stats.intelligentMode) {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>处理统计</title>
            <style>body { font-family: var(--vscode-font-family); padding: 20px; }</style>
        </head>
        <body>
            <h1>处理统计信息</h1>
            <p>智能模式未启用。请先配置AI提供商以启用智能功能。</p>
        </body>
        </html>`;
    }

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>处理统计</title>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            .stat-item { 
                padding: 10px;
                margin: 10px 0;
                background: var(--vscode-input-background);
                border-radius: 5px;
            }
            .stat-value { color: var(--vscode-charts-blue); font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>智能处理统计信息</h1>
        
        <div class="stat-item">
            <strong>总处理数量:</strong> 
            <span class="stat-value">${stats.totalProcessed}</span>
        </div>
        
        <div class="stat-item">
            <strong>平均处理时间:</strong> 
            <span class="stat-value">${stats.averageProcessingTime.toFixed(2)}ms</span>
        </div>
        
        <div class="stat-item">
            <strong>向量存储统计:</strong>
            <ul>
                <li>总向量数: ${stats.vectorStats.totalVectors}</li>
                <li>缓存大小: ${stats.vectorStats.cacheSize}</li>
                <li>内存使用: ${(stats.vectorStats.memoryUsage / 1024 / 1024).toFixed(2)}MB</li>
            </ul>
        </div>
        
        <div class="stat-item">
            <strong>推荐统计:</strong>
            <ul>
                <li>总推荐数: ${stats.recommendationStats.totalRecommendations}</li>
                <li>平均置信度: ${(stats.recommendationStats.averageConfidence * 100).toFixed(1)}%</li>
                <li>平均处理时间: ${stats.recommendationStats.averageProcessingTime.toFixed(2)}ms</li>
            </ul>
        </div>
    </body>
    </html>`;
}

export function deactivate() {
    console.log('Vibe Context Manager 插件已停用');
}