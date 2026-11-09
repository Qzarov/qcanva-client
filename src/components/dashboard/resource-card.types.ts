export type DashboardResourceAction =
  | 'move-to-folder'
  | 'duplicate'
  | 'description'
  | 'tags'
  | 'pin'
  | 'transfer'
  | 'delete'
  | 'hide-from-public';

export type DashboardResourceActionItem = {
  key: DashboardResourceAction;
  label: string;
  visible?: boolean;
  disabled?: boolean;
  danger?: boolean;
};
