/** Информация о найденном select */
export interface SelectInfo {
  /** Уникальный ID для React key */
  id: string;
  /** name атрибут, например UF_PROPS_PRODUCT_DETAIL_T[1][VALUE] */
  name: string;
  /** Номер в скобках [N] */
  index: number;
  /** Количество опций */
  optionsCount: number;
  /** Текст связанного label если есть */
  label?: string;
}

/** Опция select'а для отображения */
export interface SelectOption {
  value: string;
  text: string;
}

/** Опции для сканирования */
export interface SelectScanOptions {
  /** Паттерн для поиска select по name */
  namePattern?: RegExp;
  /** Минимальное количество опций для включения в список */
  minOptions?: number;
}

/** Дефолтный паттерн для поиска select'ов свойств Битрикс */
export const DEFAULT_SELECT_PATTERN = /UF_PROPS_PRODUCT(?:_DETAIL)?_T\[(\d+)\]\[VALUE\]/;
