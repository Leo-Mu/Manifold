import { ParsedContent, CodeBlock, QABlock } from '../types/ContextTypes';

export class ChatHistoryParser {
    parse(content: string): ParsedContent {
        const result: ParsedContent = {
            codeBlocks: [],
            jsonBlocks: [],
            qaBlocks: []
        };

        // 解析代码块
        result.codeBlocks = this.extractCodeBlocks(content);
        
        // 解析JSON块
        result.jsonBlocks = this.extractJsonBlocks(content);
        
        // 解析问答对
        result.qaBlocks = this.extractQABlocks(content);

        return result;
    }

    private extractCodeBlocks(content: string): CodeBlock[] {
        const codeBlocks: CodeBlock[] = [];
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            codeBlocks.push({
                language: match[1] || 'text',
                code: match[2].trim()
            });
        }

        return codeBlocks;
    }

    private extractJsonBlocks(content: string): any[] {
        const jsonBlocks: any[] = [];
        
        // 查找JSON代码块
        const jsonCodeRegex = /```json\n([\s\S]*?)```/g;
        let match;

        while ((match = jsonCodeRegex.exec(content)) !== null) {
            try {
                const parsed = JSON.parse(match[1].trim());
                jsonBlocks.push(parsed);
            } catch (error) {
                // 忽略无效的JSON
                console.warn('无效的JSON块:', error);
            }
        }

        // 查找内联JSON
        const inlineJsonRegex = /\{[\s\S]*?\}/g;
        const jsonMatches = content.match(inlineJsonRegex);
        
        if (jsonMatches) {
            for (const jsonStr of jsonMatches) {
                try {
                    const parsed = JSON.parse(jsonStr);
                    // 只保存复杂对象，忽略简单的键值对
                    if (typeof parsed === 'object' && Object.keys(parsed).length > 2) {
                        jsonBlocks.push(parsed);
                    }
                } catch (error) {
                    // 忽略无效的JSON
                }
            }
        }

        return jsonBlocks;
    }

    private extractQABlocks(content: string): QABlock[] {
        const qaBlocks: QABlock[] = [];
        
        // 简单的问答识别模式
        const lines = content.split('\n');
        let currentQuestion = '';
        let currentAnswer = '';
        let inAnswer = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 识别问题模式
            if (this.isQuestion(line)) {
                // 保存之前的问答对
                if (currentQuestion && currentAnswer) {
                    qaBlocks.push({
                        question: currentQuestion.trim(),
                        answer: currentAnswer.trim()
                    });
                }
                
                currentQuestion = line;
                currentAnswer = '';
                inAnswer = false;
            } else if (currentQuestion && line) {
                // 收集答案
                if (!inAnswer) {
                    inAnswer = true;
                }
                currentAnswer += line + '\n';
            }
        }

        // 保存最后一个问答对
        if (currentQuestion && currentAnswer) {
            qaBlocks.push({
                question: currentQuestion.trim(),
                answer: currentAnswer.trim()
            });
        }

        return qaBlocks;
    }

    private isQuestion(line: string): boolean {
        // 识别问题的简单规则
        return line.endsWith('?') || 
               line.endsWith('？') ||
               line.startsWith('Q:') ||
               line.startsWith('问:') ||
               line.includes('如何') ||
               line.includes('怎么') ||
               line.includes('什么是');
    }
}