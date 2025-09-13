# 流式输出修复指南

## 问题描述
原始错误：`response.body.getReader is not a function`

这个错误是因为 `node-fetch` 库的 `response.body` 返回的是 Node.js 的 Readable stream，而不是 Web Streams API 的 ReadableStream。

## 修复方案

### 1. 问题根源
- VS Code 扩展运行在 Node.js 环境中
- `node-fetch` 的 `response.body` 是 Node.js 的 `Readable` stream
- Web Streams API 的 `getReader()` 方法在 Node.js 环境中不可用

### 2. 解决方案
将 Web Streams API 的处理方式改为 Node.js Streams API：

```typescript
// 错误的方式 (Web Streams API)
const reader = response.body.getReader();
const { done, value } = await reader.read();

// 正确的方式 (Node.js Streams API)
response.body.on('data', (chunk: Buffer) => {
    // 处理数据块
});

response.body.on('end', () => {
    // 流结束
});

response.body.on('error', (error: Error) => {
    // 处理错误
});
```

### 3. 具体修改

#### OpenAI Provider
```typescript
async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
    // ... 请求设置 ...
    
    return new Promise((resolve, reject) => {
        let buffer = '';
        
        response.body!.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                // 解析 SSE 格式数据
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        onChunk({ content: '', finished: true });
                        resolve();
                        return;
                    }
                    // 处理 JSON 数据
                }
            }
        });

        response.body!.on('end', () => {
            onChunk({ content: '', finished: true });
            resolve();
        });

        response.body!.on('error', reject);
    });
}
```

#### Anthropic Provider
类似的修改，但处理 Anthropic 特有的流式格式：
- `content_block_delta` 事件包含文本内容
- `message_stop` 事件表示流结束

#### Custom Provider
兼容 OpenAI 格式的自定义 API 提供商

### 4. 降级机制
添加了自动降级功能，当流式输出失败时自动回退到普通模式：

```typescript
try {
    // 尝试流式输出
    await this.aiProvider.chatStream(messages, onChunk);
} catch (error) {
    console.warn('流式输出失败，尝试降级到普通模式:', error);
    
    // 降级到普通模式
    const response = await this.aiProvider.chat(messages);
    onChunk({
        content: response.content,
        finished: true,
        usage: response.usage
    });
}
```

## 测试方法

### 1. 基本测试
1. 启动扩展
2. 配置 AI 提供商（OpenAI、Anthropic 或自定义）
3. 打开 AI 对话界面
4. 发送一条消息
5. 观察是否出现流式输出效果

### 2. 错误处理测试
1. 配置错误的 API Key
2. 发送消息，观察错误处理
3. 配置正确的 API Key
4. 再次发送消息，观察是否正常工作

### 3. 降级测试
可以通过修改代码临时禁用流式功能来测试降级机制：

```typescript
// 临时禁用流式输出进行测试
async chatStream() {
    throw new Error('测试降级机制');
}
```

## 预期效果

### 成功的流式输出
- 消息逐字符或逐词显示
- 显示打字光标动画 `▋`
- 实时滚动到最新内容
- 完成时显示 Token 使用统计

### 降级模式
- 如果流式失败，自动切换到普通模式
- 一次性显示完整响应
- 不显示打字动画
- 仍然显示 Token 使用统计

## 常见问题

### Q: 仍然出现 getReader 错误
A: 确保已经重新编译并重启 VS Code

### Q: 流式输出很慢或卡顿
A: 检查网络连接和 API 响应速度

### Q: 某些提供商不支持流式
A: 系统会自动降级到普通模式，这是正常行为

### Q: 流式输出中断
A: 检查 API Key 是否正确，网络是否稳定

## 调试信息

启用调试模式查看详细日志：
1. 打开 VS Code 开发者工具 (Ctrl+Shift+I)
2. 查看 Console 标签页
3. 发送消息时观察日志输出

常见日志信息：
- `解析流数据失败:` - 数据解析错误
- `流式输出失败，尝试降级到普通模式:` - 自动降级
- `AI 对话失败:` - 最终失败错误