import * as vscode from 'vscode';
import { ChatManager, ChatSession } from '../ai/ChatManager';

export class ChatTreeProvider implements vscode.TreeDataProvider<ChatTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChatTreeItem | undefined | null | void> = new vscode.EventEmitter<ChatTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private chatManager: ChatManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChatTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ChatTreeItem): Promise<ChatTreeItem[]> {
        if (!element) {
            // 根节点，返回所有会话
            const sessions = this.chatManager.getAllSessions();
            const currentSession = this.chatManager.getCurrentSession();
            
            const items = sessions.map(session => {
                const item = new ChatTreeItem(
                    session.title,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'session',
                    session
                );
                
                if (currentSession?.id === session.id) {
                    item.description = '(当前)';
                    item.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.green'));
                } else {
                    item.iconPath = new vscode.ThemeIcon('comment');
                }
                
                item.tooltip = `创建时间: ${session.createdAt.toLocaleString()}\n消息数: ${session.messages.length}\n上下文数: ${session.contextIds.length}`;
                
                return item;
            });

            // 添加新建对话按钮
            const newChatItem = new ChatTreeItem(
                '+ 新建对话',
                vscode.TreeItemCollapsibleState.None,
                'newChat'
            );
            newChatItem.iconPath = new vscode.ThemeIcon('add');
            newChatItem.command = {
                command: 'vibeContext.newChat',
                title: '新建对话'
            };

            return [newChatItem, ...items];
        } else if (element.itemType === 'session' && element.session) {
            // 展开会话，显示消息
            const messages = element.session.messages;
            return messages.map((message, index) => {
                const item = new ChatTreeItem(
                    message.role === 'user' ? '👤 用户' : '🤖 助手',
                    vscode.TreeItemCollapsibleState.None,
                    'message'
                );
                
                item.description = this.truncateText(message.content, 50);
                item.tooltip = message.content;
                
                return item;
            });
        }

        return [];
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }
}

export class ChatTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'session' | 'message' | 'newChat',
        public readonly session?: ChatSession
    ) {
        super(label, collapsibleState);
        
        this.contextValue = itemType;
        
        if (itemType === 'session') {
            this.command = {
                command: 'vibeContext.loadChatSession',
                title: '加载对话',
                arguments: [session?.id]
            };
        }
    }
}