export const PROPERTY_TEMPLATE_SCHEMA_VERSION = 1;

export type PropertyTemplateItem = {
  value: string;
  name: string;
  sort: string;
};

export type PropertyTemplate = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: PropertyTemplateItem[];
};

export type PropertyTemplateStore = {
  version: typeof PROPERTY_TEMPLATE_SCHEMA_VERSION;
  templates: PropertyTemplate[];
};

export const EMPTY_PROPERTY_TEMPLATE_STORE: PropertyTemplateStore = {
  version: PROPERTY_TEMPLATE_SCHEMA_VERSION,
  templates: [],
};
