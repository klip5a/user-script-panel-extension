declare const chrome: {
  sidePanel?: {
    setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
    open: (options: { windowId: number }) => Promise<void>;
  };
  tabs: {
    query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<
      Array<{
        windowId?: number;
      }>
    >;
  };
  storage: {
    local: {
      get: <T extends Record<string, unknown>>(defaults: T) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    onChanged: {
      addListener: (
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string
        ) => void
      ) => void;
      removeListener: (
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string
        ) => void
      ) => void;
    };
  };
};
