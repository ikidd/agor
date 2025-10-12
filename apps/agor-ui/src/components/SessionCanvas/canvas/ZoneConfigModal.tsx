/**
 * Modal for configuring zone triggers (coming soon)
 */

import { Alert, Input, Modal, Select, theme } from 'antd';
import { useId, useState } from 'react';

interface ZoneConfigModalProps {
  open: boolean;
  onCancel: () => void;
  zoneName: string;
}

export const ZoneConfigModal = ({ open, onCancel, zoneName }: ZoneConfigModalProps) => {
  const { token } = theme.useToken();
  const [triggerType, setTriggerType] = useState<'prompt' | 'task' | 'subtask'>('prompt');
  const [triggerText, setTriggerText] = useState('');
  const triggerTypeId = useId();
  const triggerTextId = useId();

  return (
    <Modal
      title={`Configure Zone: ${zoneName}`}
      open={open}
      onCancel={onCancel}
      onOk={onCancel}
      okText="Save"
      okButtonProps={{ disabled: true }}
      cancelText="Cancel"
      width={600}
    >
      <Alert
        message="Coming Soon"
        description="Zone triggers will allow you to automatically execute actions when sessions are dropped into this zone. This feature is currently under development."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor={triggerTypeId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Trigger Type
        </label>
        <Select
          id={triggerTypeId}
          value={triggerType}
          onChange={setTriggerType}
          style={{ width: '100%' }}
          options={[
            { value: 'prompt', label: 'Prompt - Send a message to the session' },
            { value: 'task', label: 'Task - Create a new task' },
            { value: 'subtask', label: 'Subtask - Create a subtask for the session' },
          ]}
        />
      </div>

      <div>
        <label
          htmlFor={triggerTextId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Trigger
        </label>
        <Input.TextArea
          id={triggerTextId}
          value={triggerText}
          onChange={e => setTriggerText(e.target.value)}
          placeholder="Enter the prompt or task description that will be triggered..."
          rows={6}
        />
      </div>
    </Modal>
  );
};
