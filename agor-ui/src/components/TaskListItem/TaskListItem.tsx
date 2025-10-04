import { Task } from '../../types';
import { CheckCircleFilled, ThunderboltFilled, ClockCircleOutlined, CloseCircleFilled } from '@ant-design/icons';
import { Space, Tag, Typography, Tooltip, List, theme } from 'antd';

const { Text } = Typography;
const { useToken } = theme;

interface TaskListItemProps {
  task: Task;
  onClick?: () => void;
  compact?: boolean;
}

const TaskListItem = ({ task, onClick, compact = false }: TaskListItemProps) => {
  const { token } = useToken();

  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 16 }} />;
      case 'running':
        return <ThunderboltFilled style={{ color: token.colorWarning, fontSize: 16 }} />;
      case 'failed':
        return <CloseCircleFilled style={{ color: token.colorError, fontSize: 16 }} />;
      case 'created':
      default:
        return <ClockCircleOutlined style={{ color: token.colorTextDisabled, fontSize: 16 }} />;
    }
  };

  const messageCount = task.message_range.end_index - task.message_range.start_index + 1;
  const hasReport = !!task.report;

  // Truncate description if too long
  const MAX_LENGTH = 60;
  const description = task.description || task.full_prompt || 'Untitled task';
  const isTruncated = description.length > MAX_LENGTH;
  const displayDescription = isTruncated
    ? description.substring(0, MAX_LENGTH) + '...'
    : description;

  // Use full_prompt for tooltip if available, otherwise use description
  const tooltipText = task.full_prompt || (isTruncated ? description : null);

  return (
    <List.Item
      onClick={onClick}
      style={{
        cursor: 'pointer',
        padding: compact ? '4px 8px' : '8px 12px',
        borderRadius: token.borderRadius,
      }}
    >
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 4 }}>
          <Space size={8}>
            {getStatusIcon()}
            {tooltipText ? (
              <Tooltip title={<div style={{ whiteSpace: 'pre-wrap' }}>{tooltipText}</div>}>
                <Text style={{ fontSize: compact ? 13 : 14, fontWeight: 500 }}>{displayDescription}</Text>
              </Tooltip>
            ) : (
              <Text style={{ fontSize: compact ? 13 : 14, fontWeight: 500 }}>{displayDescription}</Text>
            )}
          </Space>
        </div>

        <div style={{ marginLeft: compact ? 20 : 24 }}>
          <Space size={4} wrap>
            <Tag icon={<span>💬</span>} color="default">
              {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
            </Tag>
            {hasReport && (
              <Tag icon={<span>📄</span>} color="blue">
                report
              </Tag>
            )}
            {!compact && task.git_state.sha_at_end && task.git_state.sha_at_start !== task.git_state.sha_at_end && (
              <Tag color="purple">
                <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {task.git_state.sha_at_start.substring(0, 7)} → {task.git_state.sha_at_end.substring(0, 7)}
                </Text>
              </Tag>
            )}
          </Space>
        </div>
      </div>
    </List.Item>
  );
};

export default TaskListItem;
