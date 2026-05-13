/**
 * Результат парсинга значения для сортировки
 */
export interface ParsedValue {
  /** Тип значения */
  type: "number" | "string";
  /** Тип числового значения для приоритетной сортировки */
  subtype: "default" | "square" | "diameter";
  /** Числовое значение (для чисел и диапазонов) */
  numValue: number;
  /** Строковое значение (для строк) */
  strValue: string;
  /** Оригинальная строка */
  original: string;
  /** Является ли число дробным (имеет десятичную часть) */
  isFractional: boolean;
}

/**
 * Нормализует числовую строку: заменяет запятую на точку
 * Поддерживает форматы: "4,05", "4.05", "0.3", ".5"
 */
function normalizeNumberString(numStr: string): string {
  // Заменяем запятую на точку
  return numStr.replace(",", ".");
}

/**
 * Паттерн для чисел с десятичной частью (точка или запятая)
 * Поддерживает: "4", "4.05", "4,05", "0.3", ".5", ",5"
 */
const SQUARE_SECTION_PATTERN = /^(\d*[.,]?\d+)\s*[x×хХ]\s*(\d*[.,]?\d+)/;
const NUMBER_PATTERN = /^(\d*[.,]?\d+)$/;

/**
 * Парсит строку значения для интеллектуальной сортировки
 *
 * Поддерживает:
 * - Диапазоны: "0.01 - 5", "10-20", "4,05 - 5,5" → берётся начальное число
 * - Квадратные сечения: "30x30", "30 × 30", "30х30 мм" → число стороны
 * - Диаметры: "Ø50", "D50", "d 50", "Ø4,5" → число после символа
 * - Чистые числа: "300", "4.05", "4,05", "0.3", ".5" → прямое значение
 * - Числа с единицей: "300 мм", "4,5 кг" → число в начале
 * - Строки: всё остальное → localeCompare
 */
export function parseValue(value: string): ParsedValue {
  const trimmed = value.trim();

  // 1. Диапазон "0.01 - 5", "10-20", "4,05 - 5,5"
  const rangeMatch = trimmed.match(/^(\d*[.,]?\d+)\s*[-–—]\s*(\d*[.,]?\d+)$/);
  if (rangeMatch) {
    const numStr = normalizeNumberString(rangeMatch[1]);
    const numValue = parseFloat(numStr);
    return {
      type: "number",
      subtype: "default",
      numValue,
      strValue: trimmed,
      original: value,
      isFractional: !Number.isInteger(numValue),
    };
  }

  // 2. Квадратное сечение "30x30", "30 × 30", "30х30 мм"
  const squareMatch = trimmed.match(SQUARE_SECTION_PATTERN);
  if (squareMatch) {
    const firstStr = normalizeNumberString(squareMatch[1]);
    const secondStr = normalizeNumberString(squareMatch[2]);
    const firstValue = parseFloat(firstStr);
    const secondValue = parseFloat(secondStr);
    if (!isNaN(firstValue) && !isNaN(secondValue) && firstValue === secondValue) {
      return {
        type: "number",
        subtype: "square",
        numValue: firstValue,
        strValue: trimmed,
        original: value,
        isFractional: !Number.isInteger(firstValue),
      };
    }
  }

  // 3. Диаметр "Ø50", "D50", "d 50", "Ø4,5"
  const diameterMatch = trimmed.match(/^[ØDd]\s*(\d*[.,]?\d+)/);
  if (diameterMatch) {
    const numStr = normalizeNumberString(diameterMatch[1]);
    const numValue = parseFloat(numStr);
    return {
      type: "number",
      subtype: "diameter",
      numValue,
      strValue: trimmed,
      original: value,
      isFractional: !Number.isInteger(numValue),
    };
  }

  // 3. Чистое число (включая десятичные с точкой или запятой)
  if (NUMBER_PATTERN.test(trimmed)) {
    const numStr = normalizeNumberString(trimmed);
    const numValue = parseFloat(numStr);
    return {
      type: "number",
      subtype: "default",
      numValue,
      strValue: trimmed,
      original: value,
      isFractional: !Number.isInteger(numValue),
    };
  }

  // 4. Число в начале строки "300 мм", "4,5 кг", "0.3 м"
  const prefixedNumMatch = trimmed.match(/^(\d*[.,]?\d+)\s/);
  if (prefixedNumMatch) {
    const numStr = normalizeNumberString(prefixedNumMatch[1]);
    const parsedNum = parseFloat(numStr);
    // Проверяем, что это действительно число (не NaN)
    if (!isNaN(parsedNum)) {
      return {
        type: "number",
        subtype: "default",
        numValue: parsedNum,
        strValue: trimmed,
        original: value,
        isFractional: !Number.isInteger(parsedNum),
      };
    }
  }

  // 5. Строковое значение
  return {
    type: "string",
    subtype: "default",
    numValue: 0,
    strValue: trimmed.toLowerCase(),
    original: value,
    isFractional: false,
  };
}

/**
 * Сравнивает два распарсенных значения для сортировки
 *
 * Правила:
 * - Числа всегда идут раньше строк
 * - Сначала идут обычные числовые значения, затем квадратные сечения, и только потом диаметры
 * - Числа сравниваются численно внутри своей категории
 * - Строки сравниваются лексикографически (ru locale)
 */
export function compareParsed(a: ParsedValue, b: ParsedValue): number {
  // Числа всегда идут раньше строк
  if (a.type === "number" && b.type === "string") return -1;
  if (a.type === "string" && b.type === "number") return 1;

  // Оба числа — сравниваем с учётом приоритета категории
  if (a.type === "number" && b.type === "number") {
    const subtypeOrder: Record<ParsedValue["subtype"], number> = {
      default: 0,
      square: 1,
      diameter: 2,
    };

    const aOrder = subtypeOrder[a.subtype];
    const bOrder = subtypeOrder[b.subtype];
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.numValue - b.numValue;
  }

  // Обе строки — лексикографически (ru locale)
  return a.strValue.localeCompare(b.strValue, "ru");
}

/**
 * Определяет множитель для SORT на основе списка значений
 *
 * @param values - Массив распарсенных значений
 * @returns Множитель (100 если есть дробные, 1 если все целые)
 */
export function determineSortMultiplier(values: ParsedValue[]): number {
  const hasFractional = values.some((v) => v.type === "number" && v.isFractional);
  return hasFractional ? 100 : 1;
}

/**
 * Форматирует числовое значение в строку SORT
 *
 * @param numValue - Числовое значение
 * @param multiplier - Множитель (100 для дробных, 1 для целых)
 * @param padLength - Длина строки с паддингом (default: 6)
 *
 * @example
 * // С дробными (×100):
 * formatSortValueFromNumber(0.3, 100)   // "000030"
 * formatSortValueFromNumber(4.05, 100)  // "000405"
 * formatSortValueFromNumber(300, 100)   // "030000"
 *
 * // Только целые (×1):
 * formatSortValueFromNumber(100, 1)     // "000100"
 * formatSortValueFromNumber(500, 1)     // "000500"
 * formatSortValueFromNumber(1000, 1)    // "001000"
 *
 * // С категорией при 6-значном шаблоне:
 * formatSortValueFromNumber(8, 1, 6, "default")  // "000008"
 * formatSortValueFromNumber(8, 1, 6, "square")   // "100008"
 * formatSortValueFromNumber(8, 1, 6, "diameter") // "200008"
 */
const SORT_SUBTYPE_OFFSET: Record<ParsedValue["subtype"], number> = {
  default: 0,
  square: 1,
  diameter: 2,
};

export function formatSortValueFromNumber(
  numValue: number,
  multiplier: number,
  padLength: number = 6,
  subtype: ParsedValue["subtype"] = "default",
): string {
  const sortNumber = Math.round(numValue * multiplier);
  const categoryOffset = SORT_SUBTYPE_OFFSET[subtype] ?? SORT_SUBTYPE_OFFSET.default;
  const groupBase = Math.pow(10, Math.max(padLength - 1, 1));
  const fullSortValue = categoryOffset * groupBase + sortNumber;
  return String(fullSortValue).padStart(padLength, "0");
}
