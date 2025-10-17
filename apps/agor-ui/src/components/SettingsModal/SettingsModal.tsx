import type {
  Board,
  CreateMCPServerInput,
  CreateUserInput,
  MCPServer,
  Repo,
  UpdateMCPServerInput,
  UpdateUserInput,
  User,
} from '@agor/core/types';
import type { Application } from '@feathersjs/feathers';
import { Modal, Tabs } from 'antd';
import { BoardsTable } from './BoardsTable';
import { ContextTable } from './ContextTable';
import { MCPServersTable } from './MCPServersTable';
import { ReposTable } from './ReposTable';
import { UsersTable } from './UsersTable';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  client: Application | null;
  boards: Board[];
  repos: Repo[];
  users: User[];
  mcpServers: MCPServer[];
  onCreateBoard?: (board: Partial<Board>) => void;
  onUpdateBoard?: (boardId: string, updates: Partial<Board>) => void;
  onDeleteBoard?: (boardId: string) => void;
  onCreateRepo?: (data: { url: string; slug: string }) => void;
  onDeleteRepo?: (repoId: string) => void;
  onDeleteWorktree?: (repoId: string, worktreeName: string) => void;
  onCreateWorktree?: (
    repoId: string,
    data: { name: string; ref: string; createBranch: boolean }
  ) => void;
  onCreateUser?: (data: CreateUserInput) => void;
  onUpdateUser?: (userId: string, updates: UpdateUserInput) => void;
  onDeleteUser?: (userId: string) => void;
  onCreateMCPServer?: (data: CreateMCPServerInput) => void;
  onUpdateMCPServer?: (serverId: string, updates: UpdateMCPServerInput) => void;
  onDeleteMCPServer?: (serverId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  client,
  boards,
  repos,
  users,
  mcpServers,
  onCreateBoard,
  onUpdateBoard,
  onDeleteBoard,
  onCreateRepo,
  onDeleteRepo,
  onDeleteWorktree,
  onCreateWorktree,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onCreateMCPServer,
  onUpdateMCPServer,
  onDeleteMCPServer,
}) => {
  return (
    <Modal
      title="Settings"
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      styles={{
        body: { padding: '24px 0' },
      }}
    >
      <Tabs
        defaultActiveKey="boards"
        items={[
          {
            key: 'boards',
            label: 'Boards',
            children: (
              <BoardsTable
                boards={boards}
                onCreate={onCreateBoard}
                onUpdate={onUpdateBoard}
                onDelete={onDeleteBoard}
              />
            ),
          },
          {
            key: 'repos',
            label: 'Repositories',
            children: (
              <ReposTable
                repos={repos}
                onCreate={onCreateRepo}
                onDelete={onDeleteRepo}
                onDeleteWorktree={onDeleteWorktree}
                onCreateWorktree={onCreateWorktree}
              />
            ),
          },
          {
            key: 'mcp',
            label: 'MCP Servers',
            children: (
              <MCPServersTable
                mcpServers={mcpServers}
                onCreate={onCreateMCPServer}
                onUpdate={onUpdateMCPServer}
                onDelete={onDeleteMCPServer}
              />
            ),
          },
          {
            key: 'context',
            label: 'Context',
            children: <ContextTable client={client} />,
          },
          {
            key: 'users',
            label: 'Users',
            children: (
              <UsersTable
                users={users}
                onCreate={onCreateUser}
                onUpdate={onUpdateUser}
                onDelete={onDeleteUser}
              />
            ),
          },
        ]}
      />
    </Modal>
  );
};
