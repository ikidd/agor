import type { PermissionMode } from '@agor/core/types';
import { LockOutlined, SafetyOutlined, UnlockOutlined } from '@ant-design/icons';
import { Radio, Space, Typography } from 'antd';

const { Text } = Typography;

export interface PermissionModeSelectorProps {
  value?: PermissionMode;
  onChange?: (value: PermissionMode) => void;
  agent?: 'claude-code' | 'cursor' | 'codex' | 'gemini';
}

const PERMISSION_MODE_INFO: Record<
  PermissionMode,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }
> = {
  ask: {
    label: 'Ask (Read-Only)',
    description: 'Require approval for every tool use',
    icon: <LockOutlined />,
    color: '#f5222d', // Red
  },
  auto: {
    label: 'Auto (Recommended)',
    description: 'Auto-approve safe operations, ask for dangerous ones',
    icon: <SafetyOutlined />,
    color: '#52c41a', // Green
  },
  'allow-all': {
    label: 'Allow All',
    description: 'Auto-approve all operations',
    icon: <UnlockOutlined />,
    color: '#faad14', // Orange/yellow
  },
};

export const PermissionModeSelector: React.FC<PermissionModeSelectorProps> = ({
  value = 'auto',
  onChange,
  agent,
}) => {
  // Agent-specific descriptions
  const getDescription = (mode: PermissionMode): string => {
    if (agent === 'codex') {
      if (mode === 'ask') return 'Suggest mode: View code and suggest changes only';
      if (mode === 'auto') return 'Auto-edit mode: Create/edit files, ask for shell commands';
      if (mode === 'allow-all') return 'Full-auto mode: No approval needed';
    }

    return PERMISSION_MODE_INFO[mode].description;
  };

  return (
    <Radio.Group value={value} onChange={e => onChange?.(e.target.value)}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {(Object.keys(PERMISSION_MODE_INFO) as PermissionMode[]).map(mode => (
          <Radio key={mode} value={mode}>
            <Space>
              <span style={{ color: PERMISSION_MODE_INFO[mode].color }}>
                {PERMISSION_MODE_INFO[mode].icon}
              </span>
              <div>
                <Text strong>{PERMISSION_MODE_INFO[mode].label}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {getDescription(mode)}
                </Text>
              </div>
            </Space>
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  );
};
