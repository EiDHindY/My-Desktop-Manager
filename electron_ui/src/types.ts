export interface Task {
  id: string;
  name: string;
  script: string;
  icon?: string;
  icons?: string[];
  shortcut?: string;
  isExecutable?: boolean;
}

export interface Template {
  name: string;
  filename: string;
  isDivider?: boolean;
  tasks?: Task[];
}

export interface FolderNode {
  id: string;
  type: 'note' | 'checkbox';
  text: string;
  checked?: boolean;
  content?: string;
  name?: string;
  details?: string;
}

export interface SessionData {
  folders?: Record<string, string[]>;
  creation_times?: Record<string, number>;
  folder_order?: string[];
  desktop_groups?: Record<string, any>;
}

export interface HistoryData {
  last_uuid: string | null;
  history: string[];
}

export interface DesktopCounts {
  [uuid: string]: number;
}

export interface DesktopInfo {
  names: Record<string, string>;
  priorities: Record<string, number>;
  counts?: DesktopCounts;
  apps?: Record<string, string[]>;
  icons?: Record<string, string>;
  shortcuts?: Record<string, string>;
  pinned?: Record<string, boolean>;
  current: string | null;
}

export interface ChecklistTask {
  id: string;
  text: string;
  checked: boolean;
}

export interface TasksData {
  general: ChecklistTask[];
  live: Record<string, ChecklistTask[]>;
  templates: Record<string, ChecklistTask[]>;
  expanded_categories: string[];
}

export interface NotesData {
  folders?: Record<string, any[]>;
  folder_order?: string[];
  folder_names?: Record<string, string>;
  folder_is_divider?: Record<string, boolean>;
  expanded_folders?: string[];
}

export interface AppData {
  session: SessionData;
  tasks: TasksData;
  notes: NotesData;
  notes_new?: any;
}
