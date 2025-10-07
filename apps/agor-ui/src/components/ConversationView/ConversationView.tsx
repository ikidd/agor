/**
 * ConversationView - Beautiful chat interface using Ant Design X Bubble
 *
 * Displays conversation messages with:
 * - User messages on the right
 * - Assistant messages on the left
 * - Typing effects for assistant responses
 * - Loading states
 * - Auto-scrolling to latest message
 *
 * This component is purely presentational - it receives messages and renders them.
 * Message fetching is handled by parent components via useMessages hook.
 */

import type { AgorClient } from '@agor/core/api';
import type { SessionID } from '@agor/core/types';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Bubble } from '@ant-design/x';
import { Alert, Avatar, Spin } from 'antd';
import { useEffect, useRef } from 'react';
import { useMessages } from '../../hooks';
import type { Message } from '../../types';

export interface ConversationViewProps {
  /**
   * Agor client for fetching messages
   */
  client: AgorClient | null;

  /**
   * Session ID to fetch messages for
   */
  sessionId: SessionID | null;
}

export const ConversationView: React.FC<ConversationViewProps> = ({ client, sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch messages for this session
  const { messages, loading, error } = useMessages(client, sessionId);

  // Auto-scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to scroll on messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  // Extract text content from message
  const getMessageText = (message: Message): string => {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      // Find text blocks in content array
      const textBlocks = message.content
        .filter((block: { type: string }) => block.type === 'text')
        .map((block: { text?: string }) => block.text || '')
        .join('\n\n');
      return textBlocks || message.content_preview || '';
    }

    return message.content_preview || '';
  };

  if (error) {
    return <Alert type="error" message="Failed to load messages" description={error} showIcon />;
  }

  if (loading && messages.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Spin tip="Loading messages..." />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {messages.map(message => {
        const isUser = message.role === 'user';
        const text = getMessageText(message);

        return (
          <Bubble
            key={message.message_id}
            placement={isUser ? 'end' : 'start'}
            avatar={
              isUser ? (
                <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
              ) : (
                <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />
              )
            }
            content={text}
            variant={isUser ? 'filled' : 'outlined'}
            styles={{
              content: {
                backgroundColor: isUser ? '#1890ff' : undefined,
                color: isUser ? '#fff' : undefined,
              },
            }}
          />
        );
      })}
    </div>
  );
};
