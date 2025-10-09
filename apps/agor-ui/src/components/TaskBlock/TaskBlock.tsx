/**
 * TaskBlock - Collapsible task section containing messages
 *
 * Features:
 * - Collapsed: Shows task summary with metadata
 * - Expanded: Shows all messages in the task
 * - Default: Latest task expanded, older collapsed
 * - Progressive disclosure pattern
 * - Groups 3+ sequential tool-only messages into ToolBlock
 */

import type { Message, Task } from '@agor/core/types';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  GithubOutlined,
  MessageOutlined,
  RightOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Collapse, Space, Tag, Typography, theme } from 'antd';
import type React from 'react';
import { useMemo } from 'react';
import { MessageBlock } from '../MessageBlock';
import { ToolBlock } from '../ToolBlock';

const { Text, Paragraph } = Typography;

/**
 * Block types for rendering
 */
type Block = { type: 'message'; message: Message } | { type: 'tool-block'; messages: Message[] };

interface TaskBlockProps {
  task: Task;
  messages: Message[];
  defaultExpanded?: boolean;
}

/**
 * Check if message is tool-only (no text content, only tool uses)
 */
function isToolOnlyMessage(message: Message): boolean {
  if (typeof message.content === 'string') {
    return message.content.trim().length === 0 && message.tool_uses && message.tool_uses.length > 0;
  }

  if (Array.isArray(message.content)) {
    const hasText = message.content.some(block => block.type === 'text');
    const hasTools = message.content.some(block => block.type === 'tool_use');
    return !hasText && hasTools;
  }

  return false;
}

/**
 * Group messages into blocks:
 * - When 3+ consecutive tool-only messages appear → group into ToolBlock
 * - Otherwise → render as individual MessageBlock
 */
function groupMessagesIntoBlocks(messages: Message[]): Block[] {
  const blocks: Block[] = [];
  let toolBuffer: Message[] = [];

  for (const msg of messages) {
    if (isToolOnlyMessage(msg)) {
      // Accumulate tool-only messages
      toolBuffer.push(msg);
    } else {
      // Flush tool buffer if we have 3+ tools
      if (toolBuffer.length >= 3) {
        blocks.push({ type: 'tool-block', messages: toolBuffer });
        toolBuffer = [];
      } else if (toolBuffer.length > 0) {
        // Too few to group - render individually
        blocks.push(...toolBuffer.map(m => ({ type: 'message' as const, message: m })));
        toolBuffer = [];
      }

      // Add the current message
      blocks.push({ type: 'message', message: msg });
    }
  }

  // Flush remaining buffer
  if (toolBuffer.length >= 3) {
    blocks.push({ type: 'tool-block', messages: toolBuffer });
  } else if (toolBuffer.length > 0) {
    blocks.push(...toolBuffer.map(m => ({ type: 'message' as const, message: m })));
  }

  return blocks;
}

export const TaskBlock: React.FC<TaskBlockProps> = ({
  task,
  messages,
  defaultExpanded = false,
}) => {
  const { token } = theme.useToken();

  // Group messages into blocks
  const blocks = useMemo(() => groupMessagesIntoBlocks(messages), [messages]);

  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'running':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'processing';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  // Task header shows when collapsed
  const taskHeader = (
    <div style={{ width: '100%' }}>
      <Space size={token.sizeUnit} align="start" style={{ width: '100%' }}>
        <div style={{ fontSize: 16, marginTop: token.sizeUnit / 4 }}>{getStatusIcon()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: token.sizeUnit / 2,
            }}
          >
            <Text strong>{task.description || 'User Prompt'}</Text>
          </div>

          {/* Task metadata */}
          <Space size={token.sizeUnit * 1.5} style={{ marginTop: token.sizeUnit / 2 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <MessageOutlined /> {messages.length}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ToolOutlined /> {task.tool_use_count}
            </Text>
            {task.model && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                🤖 {task.model}
              </Text>
            )}
            {task.git_state.sha_at_end && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                <GithubOutlined /> {task.git_state.sha_at_end.substring(0, 7)}
              </Text>
            )}
            {task.report && (
              <Tag icon={<FileTextOutlined />} color="green" style={{ fontSize: 11 }}>
                Report
              </Tag>
            )}
          </Space>
        </div>
      </Space>
    </div>
  );

  return (
    <div
      style={{
        margin: `${token.sizeUnit}px 0`,
        borderLeft: `3px solid ${token.colorBorder}`,
        paddingLeft: token.sizeUnit,
      }}
    >
      <Collapse
        defaultActiveKey={defaultExpanded ? ['task-content'] : []}
        expandIcon={({ isActive }) => (isActive ? <DownOutlined /> : <RightOutlined />)}
        style={{ background: 'transparent', border: 'none' }}
        items={[
          {
            key: 'task-content',
            label: taskHeader,
            style: { border: 'none' },
            styles: {
              header: {
                padding: `${token.sizeUnit}px ${token.sizeUnit * 1.5}px`,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorder}`,
                borderRadius: token.borderRadius * 1.5,
                alignItems: 'flex-start',
              },
              body: {
                border: 'none',
                background: 'transparent',
                padding: `${token.sizeUnit}px ${token.sizeUnit * 1.5}px`,
              },
            },
            children: (
              <div style={{ paddingTop: token.sizeUnit }}>
                {blocks.length === 0 ? (
                  <Text type="secondary" style={{ fontStyle: 'italic' }}>
                    No messages in this task
                  </Text>
                ) : (
                  blocks.map(block => {
                    if (block.type === 'message') {
                      return (
                        <MessageBlock key={block.message.message_id} message={block.message} />
                      );
                    }
                    if (block.type === 'tool-block') {
                      // Use first message ID as key for tool block
                      const blockKey = `tool-block-${block.messages[0]?.message_id || 'unknown'}`;
                      return <ToolBlock key={blockKey} messages={block.messages} />;
                    }
                    return null;
                  })
                )}

                {/* Show commit message if available */}
                {task.git_state.commit_message && (
                  <div
                    style={{
                      marginTop: token.sizeUnit * 1.5,
                      padding: `${token.sizeUnit * 0.75}px ${token.sizeUnit * 1.25}px`,
                      background: 'rgba(0, 0, 0, 0.02)',
                      borderRadius: token.borderRadius,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <GithubOutlined /> Commit:{' '}
                    </Text>
                    <Text code style={{ fontSize: 11 }}>
                      {task.git_state.commit_message}
                    </Text>
                  </div>
                )}

                {/* Show report if available */}
                {task.report && (
                  <div style={{ marginTop: token.sizeUnit * 1.5 }}>
                    <Tag icon={<FileTextOutlined />} color="green">
                      Task Report
                    </Tag>
                    <Paragraph
                      style={{
                        marginTop: token.sizeUnit,
                        padding: token.sizeUnit * 1.5,
                        background: 'rgba(82, 196, 26, 0.05)',
                        border: `1px solid ${token.colorSuccessBorder}`,
                        borderRadius: token.borderRadius,
                        fontSize: 13,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {task.report}
                    </Paragraph>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};
