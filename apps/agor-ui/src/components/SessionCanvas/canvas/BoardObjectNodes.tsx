/**
 * Custom React Flow node components for board objects (text labels, zones, etc.)
 */

import { SettingOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import { useState } from 'react';
import { NodeResizer, NodeToolbar } from 'reactflow';
import type { BoardObject } from '../../types';
import { ZoneConfigModal } from './ZoneConfigModal';

/**
 * Get color palette from Ant Design preset colors
 * Uses the -6 variants (primary saturation) from the color scale
 */
const getColorPalette = (token: ReturnType<typeof theme.useToken>['token']) => [
  token.colorBorder, // gray (neutral default)
  token.red6 || token.red, // red-6
  token.orange6 || token.orange, // orange-6
  token.green6 || token.green, // green-6
  token.blue6 || token.blue, // blue-6
  token.purple6 || token.purple, // purple-6
  token.magenta6 || token.magenta, // magenta-6
];

/**
 * ZoneNode - Resizable rectangle for organizing sessions visually
 */
interface ZoneNodeData {
  objectId: string;
  label: string;
  width: number;
  height: number;
  color?: string;
  status?: string;
  x: number;
  y: number;
  onUpdate?: (objectId: string, objectData: BoardObject) => void;
}

export const ZoneNode = ({ data, selected }: { data: ZoneNodeData; selected?: boolean }) => {
  const { token } = theme.useToken();
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const colors = getColorPalette(token);

  // Helper to create full object data with current values
  const createObjectData = (
    overrides: Partial<Omit<BoardObject, 'type' | 'x' | 'y'>>
  ): BoardObject => ({
    type: 'zone',
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    label: data.label,
    color: data.color,
    status: data.status,
    ...overrides,
  });

  const handleSaveLabel = () => {
    setIsEditingLabel(false);
    if (label !== data.label && data.onUpdate) {
      data.onUpdate(data.objectId, createObjectData({ label }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setLabel(data.label); // Reset to original
      setIsEditingLabel(false);
    }
  };

  const handleColorChange = (color: string) => {
    if (data.onUpdate) {
      data.onUpdate(data.objectId, createObjectData({ color }));
    }
  };

  const borderColor = data.color || token.colorBorder;
  const backgroundColor = data.color ? `${data.color}20` : `${token.colorBgContainer}40`; // 40 = 25% opacity in hex

  return (
    <>
      <NodeToolbar isVisible={selected} position="top">
        <div
          style={{
            display: 'flex',
            gap: '12px',
            padding: '8px',
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadius,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          {/* Color picker */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {colors.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorChange(color)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  backgroundColor: color,
                  border:
                    data.color === color
                      ? `2px solid ${token.colorPrimary}`
                      : `1px solid ${token.colorBorder}`,
                  cursor: 'pointer',
                  padding: 0,
                }}
                title={`Change color to ${color}`}
              />
            ))}
          </div>
          {/* Settings button */}
          <div style={{ borderLeft: `1px solid ${token.colorBorder}`, paddingLeft: '8px' }}>
            <button
              type="button"
              onClick={() => setConfigModalOpen(true)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                backgroundColor: token.colorBgContainer,
                border: `1px solid ${token.colorBorder}`,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Configure zone triggers"
            >
              <SettingOutlined style={{ fontSize: '14px', color: token.colorText }} />
            </button>
          </div>
        </div>
      </NodeToolbar>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={200}
        handleStyle={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: borderColor,
        }}
        lineStyle={{
          borderColor: borderColor,
        }}
      />
      <div
        style={{
          width: '100%',
          height: '100%',
          border: `2px solid ${borderColor}`,
          borderRadius: token.borderRadiusLG,
          background: backgroundColor,
          padding: token.padding,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none', // Let sessions behind zone be clickable
          zIndex: -1, // Zones always behind sessions
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            cursor: isEditingLabel ? 'text' : 'move',
          }}
          onDoubleClick={() => setIsEditingLabel(true)}
        >
          {isEditingLabel ? (
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onBlur={handleSaveLabel}
              onKeyDown={handleKeyDown}
              className="nodrag" // Prevent node drag when typing
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: borderColor,
                padding: 0,
              }}
            />
          ) : (
            <h3
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 600,
                color: borderColor,
              }}
            >
              {label}
            </h3>
          )}
        </div>
        {data.status && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '12px',
              fontWeight: 500,
              color: borderColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {data.status}
          </div>
        )}
      </div>
      <ZoneConfigModal
        open={configModalOpen}
        onCancel={() => setConfigModalOpen(false)}
        zoneName={data.label}
      />
    </>
  );
};
