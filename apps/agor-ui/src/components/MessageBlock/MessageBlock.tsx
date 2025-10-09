/**
 * MessageBlock - Renders individual messages with support for structured content
 *
 * Handles:
 * - Text content (string or TextBlock)
 * - Tool use blocks
 * - Tool result blocks
 * - User vs Assistant styling
 */

import type { Message } from '@agor/core/types';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Bubble } from '@ant-design/x';
import { Avatar } from 'antd';
import type React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolUseRenderer } from '../ToolUseRenderer';
import './MessageBlock.css';

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface MessageBlockProps {
  message: Message;
}

export const MessageBlock: React.FC<MessageBlockProps> = ({ message }) => {
  const isUser = message.role === 'user';

  // Skip rendering if message has no content
  if (!message.content || (typeof message.content === 'string' && message.content.trim() === '')) {
    return null;
  }

  // Parse content blocks from message
  const getContentBlocks = (): {
    textBlocks: string[];
    toolBlocks: { toolUse: ToolUseBlock; toolResult?: ToolResultBlock }[];
  } => {
    const textBlocks: string[] = [];
    const toolBlocks: { toolUse: ToolUseBlock; toolResult?: ToolResultBlock }[] = [];

    // Handle string content
    if (typeof message.content === 'string') {
      return {
        textBlocks: [message.content],
        toolBlocks: [],
      };
    }

    // Handle array of content blocks
    if (Array.isArray(message.content)) {
      const toolUseMap = new Map<string, ToolUseBlock>();
      const toolResultMap = new Map<string, ToolResultBlock>();

      // First pass: collect tool_use and tool_result blocks
      for (const block of message.content) {
        if (block.type === 'text') {
          textBlocks.push((block as TextBlock).text);
        } else if (block.type === 'tool_use') {
          const toolUse = block as ToolUseBlock;
          toolUseMap.set(toolUse.id, toolUse);
        } else if (block.type === 'tool_result') {
          const toolResult = block as ToolResultBlock;
          toolResultMap.set(toolResult.tool_use_id, toolResult);
        }
      }

      // Second pass: match tool_use with tool_result
      for (const [id, toolUse] of toolUseMap.entries()) {
        toolBlocks.push({
          toolUse,
          toolResult: toolResultMap.get(id),
        });
      }
    }

    return { textBlocks, toolBlocks };
  };

  const { textBlocks, toolBlocks } = getContentBlocks();

  // Skip rendering if message has no meaningful content
  const hasText = textBlocks.some(text => text.trim().length > 0);
  const hasTools = toolBlocks.length > 0;

  if (!hasText && !hasTools) {
    return null;
  }

  // If this message is only tool invocations (no text), render compact
  if (!hasText && hasTools) {
    return (
      <div className="message-block message-tools-only">
        {toolBlocks.map(({ toolUse, toolResult }) => (
          <ToolUseRenderer key={toolUse.id} toolUse={toolUse} toolResult={toolResult} />
        ))}
      </div>
    );
  }

  // Render standard message with Bubble
  return (
    <div className="message-block">
      <Bubble
        placement={isUser ? 'end' : 'start'}
        avatar={
          isUser ? (
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
          ) : (
            <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />
          )
        }
        content={
          <>
            {hasText && (
              <div className="message-text">
                {isUser ? (
                  // User messages: plain text (preserve newlines)
                  textBlocks.filter(t => t.trim()).join('\n\n')
                ) : (
                  // Assistant messages: render as markdown with GFM support
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Style code blocks
                      code: ({ node, inline, className, children, ...props }) => {
                        return inline ? (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        ) : (
                          <pre>
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        );
                      },
                    }}
                  >
                    {textBlocks.filter(t => t.trim()).join('\n\n')}
                  </ReactMarkdown>
                )}
              </div>
            )}
            {toolBlocks.length > 0 && (
              <div className="message-tools">
                {toolBlocks.map(({ toolUse, toolResult }) => (
                  <ToolUseRenderer key={toolUse.id} toolUse={toolUse} toolResult={toolResult} />
                ))}
              </div>
            )}
          </>
        }
        variant={isUser ? 'filled' : 'outlined'}
        styles={{
          content: {
            backgroundColor: isUser ? '#1890ff' : undefined,
            color: isUser ? '#fff' : undefined,
          },
        }}
      />
    </div>
  );
};
