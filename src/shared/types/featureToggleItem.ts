export type FeatureToggleItem = {
  id: string;
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
};
