/**
 * ToolUseRenderer - Displays tool invocations and results
 *
 * Renders tool_use and tool_result content blocks with:
 * - Tool name and icon
 * - Collapsible input parameters
 * - Tool output/result
 * - Error states
 * - Syntax highlighting for code
 */

import type { Message } from '@agor/core/types';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Collapse, Tag, Typography, theme } from 'antd';
import type React from 'react';
import { ToolIcon } from '../ToolIcon';

const { Text, Paragraph } = Typography;

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

type ContentBlock = { type: 'text'; text: string } | ToolUseBlock | ToolResultBlock;

interface ToolUseRendererProps {
  /**
   * Tool use block with invocation details
   */
  toolUse: ToolUseBlock;

  /**
   * Optional tool result block
   */
  toolResult?: ToolResultBlock;
}

export const ToolUseRenderer: React.FC<ToolUseRendererProps> = ({ toolUse, toolResult }) => {
  const { token } = theme.useToken();
  const { name, input } = toolUse;
  const isError = toolResult?.is_error;

  // Generate smart description for tools
  const getToolDescription = (): string | null => {
    // Use explicit description if provided
    if (typeof input.description === 'string') {
      return input.description;
    }

    // Generate descriptions for common tools
    switch (name) {
      case 'Read':
        if (input.file_path) {
          // Try to make path relative (strip common prefixes)
          const path = String(input.file_path);
          const relativePath = path
            .replace(/^\/Users\/[^/]+\/code\/[^/]+\//, '') // Strip /Users/max/code/agor/
            .replace(/^\/Users\/[^/]+\//, '~/'); // Or make it ~/...
          return relativePath;
        }
        return null;

      case 'Write':
        if (input.file_path) {
          const path = String(input.file_path);
          const relativePath = path
            .replace(/^\/Users\/[^/]+\/code\/[^/]+\//, '')
            .replace(/^\/Users\/[^/]+\//, '~/');
          return `Write ${relativePath}`;
        }
        return null;

      case 'Edit':
        if (input.file_path) {
          const path = String(input.file_path);
          const relativePath = path
            .replace(/^\/Users\/[^/]+\/code\/[^/]+\//, '')
            .replace(/^\/Users\/[^/]+\//, '~/');
          return `Edit ${relativePath}`;
        }
        return null;

      case 'Grep':
        if (input.pattern) {
          return `Search: ${input.pattern}`;
        }
        return null;

      case 'Glob':
        if (input.pattern) {
          return `Find files: ${input.pattern}`;
        }
        return null;

      default:
        return null;
    }
  };

  const description = getToolDescription();

  // Extract text content from tool result
  const getResultText = (): string => {
    if (!toolResult) return '';

    if (typeof toolResult.content === 'string') {
      return toolResult.content;
    }

    if (Array.isArray(toolResult.content)) {
      return toolResult.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map(block => block.text)
        .join('\n\n');
    }

    return '';
  };

  const resultText = getResultText();

  // Tool header component
  const toolHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: token.sizeUnit, width: '100%' }}>
      <ToolIcon tool={name} size={16} />
      <Text strong>{name}</Text>
      {description && (
        <>
          <Text type="secondary">:</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {description}
          </Text>
        </>
      )}
      {toolResult && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          {isError ? (
            <CloseCircleOutlined style={{ color: token.colorError, fontSize: 16 }} />
          ) : (
            <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        padding: token.sizeUnit,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        background: token.colorBgContainer,
        margin: `${token.sizeUnit * 0.75}px 0`,
      }}
    >
      {/* Collapsible tool details with header as trigger */}
      <Collapse
        size="small"
        ghost
        defaultActiveKey={[]}
        expandIcon={({ isActive }) => (isActive ? <DownOutlined /> : <RightOutlined />)}
        items={[
          {
            key: 'details',
            label: toolHeader,
            children: (
              <div style={{ paddingLeft: token.sizeUnit * 3 }}>
                <pre
                  style={{
                    background: token.colorBgLayout,
                    padding: `${token.sizeUnit * 0.75}px ${token.sizeUnit}px`,
                    borderRadius: token.borderRadius,
                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                    fontSize: 12,
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
            ),
          },
        ]}
      />

      {/* Tool Result - always visible if present */}
      {toolResult && (
        <div
          style={{
            marginTop: token.sizeUnit,
            padding: token.sizeUnit,
            borderRadius: token.borderRadius,
            border: `1px solid ${token.colorBorder}`,
            background: isError ? 'rgba(255, 77, 79, 0.05)' : 'rgba(82, 196, 26, 0.05)',
            borderColor: isError ? token.colorErrorBorder : token.colorSuccessBorder,
          }}
        >
          <Text
            type="secondary"
            style={{ fontSize: 12, marginBottom: token.sizeUnit, display: 'block' }}
          >
            Output:
          </Text>
          <Paragraph
            ellipsis={{ rows: 10, expandable: true, symbol: 'show more' }}
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {resultText}
          </Paragraph>
        </div>
      )}
    </div>
  );
};
