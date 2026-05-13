/**
 * Результат парсинга значения для сортировки
 */
export interface ParsedValue {
  /** Тип значения */
  type: "number" | "string";
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
const NUMBER_PATTERN = /^(\d*[.,]?\d+)$/;

/**
 * Парсит строку значения для интеллектуальной сортировки
 *
 * Поддерживает:
 * - Диапазоны: "0.01 - 5", "10-20", "4,05 - 5,5" → берётся начальное число
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
      numValue,
      strValue: trimmed,
      original: value,
      isFractional: !Number.isInteger(numValue),
    };
  }

  // 2. Диаметр "Ø50", "D50", "d 50", "Ø4,5"
  const diameterMatch = trimmed.match(/^[ØDd]\s*(\d*[.,]?\d+)/);
  if (diameterMatch) {
    const numStr = normalizeNumberString(diameterMatch[1]);
    const numValue = parseFloat(numStr);
    return {
      type: "number",
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
 * - Числа сравниваются численно
 * - Строки сравниваются лексикографически (ru locale)
 */
export function compareParsed(a: ParsedValue, b: ParsedValue): number {
  // Числа всегда идут раньше строк
  if (a.type === "number" && b.type === "string") return -1;
  if (a.type === "string" && b.type === "number") return 1;

  // Оба числа — сравниваем численно
  if (a.type === "number" && b.type === "number") {
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
 */
export function formatSortValueFromNumber(
  numValue: number,
  multiplier: number,
  padLength: number = 6,
): string {
  const sortNumber = Math.round(numValue * multiplier);
  return String(sortNumber).padStart(padLength, "0");
}
