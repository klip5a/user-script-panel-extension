/**
 * Единая схема парсинга и сравнения значений для админки, проверок и отображения.
 */
export interface ParsedValue {
  /** Тип значения */
  type: "number" | "string";
  /** Display group: simple values precede compound selections and dimensions. */
  valueKind: "exact" | "range" | "compoundRange" | "dimension" | "text";
  /** Тип числового значения для приоритетной сортировки */
  subtype: "default" | "square" | "diameter";
  /** Числовое значение (для чисел и диапазонов) */
  numValue: number;
  /** Second numeric value for A x B sections. */
  secondaryNumValue?: number;
  /** Numeric components used to compare compound values such as ranges. */
  numericParts: number[];
  /** Строковое значение (для строк) */
  strValue: string;
  /** Оригинальная строка */
  original: string;
  /** Является ли число дробным (имеет десятичную часть) */
  isFractional: boolean;
}

export interface SortFormatConfig {
  padLength: number;
  squareSidePadLength: number;
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
const SQUARE_SECTION_PATTERN = /^(\d*[.,]?\d+)\s*[\u0078\u0058\u00d7\u0445\u0425]\s*(\d*[.,]?\d+)/;
const NUMBER_PATTERN = /^(\d*[.,]?\d+)$/;
const PREFIXED_NUMBER_PATTERN = /^(\d*[.,]?\d+)(?=\s|[(/])/;
const TEXT_STRING_COLLATOR = new Intl.Collator("ru", {
  numeric: false,
  sensitivity: "base",
});

type TextCodeGroup = "digit" | "letter" | "other";

type SortTextTokenKind = "number" | "text" | "separator";

interface SortTextToken {
  kind: SortTextTokenKind;
  raw: string;
  value?: number;
}

interface CompactCodeToken {
  kind: "number" | "text";
  raw: string;
  value?: number;
}

interface CompactCodeParts {
  family: string;
  tail: string;
}

function getTextCodeGroup(value: string): TextCodeGroup {
  const firstChar = value.trim().charAt(0);
  if (/^\d$/.test(firstChar)) return "digit";
  if (/^[A-Za-zА-Яа-яЁё]$/.test(firstChar)) return "letter";
  return "other";
}

function getNumericParts(value: string): number[] {
  return (value.match(/\d+(?:[.,]\d+)?|[.,]\d+/g) ?? []).map((part) =>
    Number.parseFloat(normalizeNumberString(part)),
  );
}

function tokenizeSortText(value: string): SortTextToken[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const parts = normalized.match(/\d+(?:[.,]\d+)?|[a-zа-яё]+|[^a-zа-яё\d]+/gi) ?? [];
  return parts.map((part) => {
    if (/^\d+(?:[.,]\d+)?$/.test(part)) {
      return {
        kind: "number" as const,
        raw: part,
        value: Number.parseFloat(normalizeNumberString(part)),
      };
    }

    if (/^[a-zа-яё]+$/i.test(part)) {
      return {
        kind: "text" as const,
        raw: part,
      };
    }

    return {
      kind: "separator" as const,
      raw: part,
    };
  });
}

function isCcStyleCode(value: string): boolean {
  return /^cc\.\./i.test(value.trim());
}

function parseCompactCode(value: string): CompactCodeParts | null {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  const match = normalized.match(/^([A-Z]+)(\d.*)$/);
  if (!match) {
    return null;
  }

  return {
    family: match[1],
    tail: match[2],
  };
}

function tokenizeCompactTail(value: string): CompactCodeToken[] {
  const parts = value.match(/\d+|[A-Z]+/g) ?? [];
  return parts.map((part) =>
    /^\d+$/.test(part)
      ? {
          kind: "number" as const,
          raw: part,
          value: Number.parseInt(part, 10),
        }
      : {
          kind: "text" as const,
          raw: part,
        },
  );
}

function compareCompactCodeTokens(aTokens: CompactCodeToken[], bTokens: CompactCodeToken[]): number {
  const tokenOrder: Record<CompactCodeToken["kind"], number> = {
    number: 0,
    text: 1,
  };

  const commonLength = Math.min(aTokens.length, bTokens.length);
  for (let i = 0; i < commonLength; i++) {
    const aToken = aTokens[i];
    const bToken = bTokens[i];

    const kindDifference = tokenOrder[aToken.kind] - tokenOrder[bToken.kind];
    if (kindDifference !== 0) {
      return kindDifference;
    }

    if (aToken.kind === "number" && bToken.kind === "number") {
      const numberDifference = (aToken.value ?? 0) - (bToken.value ?? 0);
      if (numberDifference !== 0) {
        return numberDifference;
      }
      continue;
    }

    const textDifference = TEXT_STRING_COLLATOR.compare(aToken.raw, bToken.raw);
    if (textDifference !== 0) {
      return textDifference;
    }
  }

  return aTokens.length - bTokens.length;
}

function compareCompactCodeTails(aTail: string, bTail: string): number {
  const aPureNumber = /^\d+$/.test(aTail);
  const bPureNumber = /^\d+$/.test(bTail);

  if (aPureNumber && bPureNumber) {
    const numberDifference = Number.parseInt(aTail, 10) - Number.parseInt(bTail, 10);
    if (numberDifference !== 0) {
      return numberDifference;
    }
    return aTail.length - bTail.length;
  }

  if (aPureNumber !== bPureNumber) {
    return aPureNumber ? -1 : 1;
  }

  return compareCompactCodeTokens(tokenizeCompactTail(aTail), tokenizeCompactTail(bTail));
}

function compareSortTextTokens(aTokens: SortTextToken[], bTokens: SortTextToken[]): number {
  const tokenOrder: Record<SortTextTokenKind, number> = {
    number: 0,
    text: 1,
    separator: 2,
  };

  const commonLength = Math.min(aTokens.length, bTokens.length);
  for (let i = 0; i < commonLength; i++) {
    const aToken = aTokens[i];
    const bToken = bTokens[i];
    const kindDifference = tokenOrder[aToken.kind] - tokenOrder[bToken.kind];
    if (kindDifference !== 0) {
      return kindDifference;
    }

    if (aToken.kind === "number" && bToken.kind === "number") {
      const numberDifference = (aToken.value ?? 0) - (bToken.value ?? 0);
      if (numberDifference !== 0) {
        return numberDifference;
      }
      continue;
    }

    const textDifference = TEXT_STRING_COLLATOR.compare(aToken.raw, bToken.raw);
    if (textDifference !== 0) {
      return textDifference;
    }
  }

  return aTokens.length - bTokens.length;
}

export function compareNaturalTextValues(a: string, b: string): number {
  if (isCcStyleCode(a) && isCcStyleCode(b)) {
    const aCode = parseCompactCode(a);
    const bCode = parseCompactCode(b);
    if (aCode && bCode) {
      const familyDifference = TEXT_STRING_COLLATOR.compare(aCode.family, bCode.family);
      if (familyDifference !== 0) {
        return familyDifference;
      }

      const compactDifference = compareCompactCodeTails(aCode.tail, bCode.tail);
      if (compactDifference !== 0) {
        return compactDifference;
      }
    }
  }

  const groupOrder: Record<TextCodeGroup, number> = {
    digit: 0,
    letter: 1,
    other: 2,
  };
  const aGroup = getTextCodeGroup(a);
  const bGroup = getTextCodeGroup(b);
  const groupDifference = groupOrder[aGroup] - groupOrder[bGroup];
  if (groupDifference !== 0) {
    return groupDifference;
  }

  const tokenDifference = compareSortTextTokens(tokenizeSortText(a), tokenizeSortText(b));
  if (tokenDifference !== 0) {
    return tokenDifference;
  }

  return TEXT_STRING_COLLATOR.compare(a.trim().toLowerCase(), b.trim().toLowerCase());
}

/**
 * Парсит строку значения для интеллектуальной сортировки
 *
 * Поддерживает:
 * - Диапазоны: "0.01 - 5", "10-20", "0-10 / 0-100" → сравниваются по границам
 * - Квадратные сечения: "30x30", "30 × 30", "30х30 мм" → число стороны
 * - Диаметры: "Ø50", "D50", "d 50", "Ø4,5" → число после символа
 * - Чистые числа: "300", "4.05", "4,05", "0.3", ".5" → прямое значение
 * - Числа с уточнением: "300 мм", "12.5(8)", "140 / 170" → число в начале
 * - Строки: всё остальное → localeCompare
 */
export function parseValue(value: string): ParsedValue {
  const trimmed = value.trim();

  // 1. Диапазон "0.01 - 5", "10-20", "0-10 / 0-100"
  const rangeMatch = trimmed.match(/^(\d*[.,]?\d+)\s*[-–—]\s*(\d*[.,]?\d+)/);
  if (rangeMatch) {
    const numStr = normalizeNumberString(rangeMatch[1]);
    const numValue = parseFloat(numStr);
    return {
      type: "number",
      valueKind: trimmed.includes("/") ? "compoundRange" : "range",
      subtype: "default",
      numValue,
      numericParts: getNumericParts(trimmed),
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
    if (!isNaN(firstValue) && !isNaN(secondValue)) {
      return {
        type: "number",
        valueKind: "dimension",
        subtype: "square",
        numValue: firstValue,
        secondaryNumValue: secondValue,
        numericParts: getNumericParts(trimmed),
        strValue: trimmed,
        original: value,
        isFractional: !Number.isInteger(firstValue) || !Number.isInteger(secondValue),
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
      valueKind: "exact",
      subtype: "diameter",
      numValue,
      numericParts: [numValue],
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
      valueKind: "exact",
      subtype: "default",
      numValue,
      numericParts: [numValue],
      strValue: trimmed,
      original: value,
      isFractional: !Number.isInteger(numValue),
    };
  }

  // 4. Число в начале строки "300 мм", "12.5(8)", "140 / 170"
  const prefixedNumMatch = trimmed.match(PREFIXED_NUMBER_PATTERN);
  if (prefixedNumMatch) {
    const numStr = normalizeNumberString(prefixedNumMatch[1]);
    const parsedNum = parseFloat(numStr);
    // Проверяем, что это действительно число (не NaN)
    if (!isNaN(parsedNum)) {
      return {
        type: "number",
        valueKind: trimmed.includes("/") ? "dimension" : "exact",
        subtype: "default",
        numValue: parsedNum,
        numericParts: getNumericParts(trimmed),
        strValue: trimmed,
        original: value,
        isFractional: !Number.isInteger(parsedNum),
      };
    }
  }

  // 5. Строковое значение
  return {
    type: "string",
    valueKind: "text",
    subtype: "default",
    numValue: 0,
    numericParts: [],
    strValue: trimmed.toLowerCase(),
    original: value,
    isFractional: false,
  };
}

/**
 * Сравнивает два распарсенных значения для сортировки
 *
 * Правила:
 * - Точные значения идут раньше одиночных и составных диапазонов
 * - Одиночные диапазоны идут раньше объединённых вариантов через "/"
 * - Числа сравниваются численно внутри своей группы
 * - Строки сравниваются лексикографически (ru locale)
 */
export function compareParsed(a: ParsedValue, b: ParsedValue): number {
  // Числа всегда идут раньше строк
  if (a.type === "number" && b.type === "string") return -1;
  if (a.type === "string" && b.type === "number") return 1;

  if (a.type === "number" && b.type === "number") {
    const subtypeOrder: Record<ParsedValue["subtype"], number> = {
      default: 0,
      square: 1,
      diameter: 2,
    };

    const subtypeDifference = subtypeOrder[a.subtype] - subtypeOrder[b.subtype];
    if (subtypeDifference !== 0) {
      return subtypeDifference;
    }

    if (a.subtype === "default" && b.subtype === "default") {
      const groupOrder: Record<ParsedValue["valueKind"], number> = {
        exact: 0,
        range: 1,
        compoundRange: 2,
        dimension: 3,
        text: 4,
      };
      const groupDifference = groupOrder[a.valueKind] - groupOrder[b.valueKind];
      if (groupDifference !== 0) {
        return groupDifference;
      }
    }

    // Внутри чисел и составных значений сравниваем все компоненты: 0-0.12 < 0-0.2 < 0-25.
    const commonLength = Math.min(a.numericParts.length, b.numericParts.length);
    for (let i = 0; i < commonLength; i++) {
      const difference = a.numericParts[i] - b.numericParts[i];
      if (difference !== 0) {
        return difference;
      }
    }

    const lengthDifference = a.numericParts.length - b.numericParts.length;
    return lengthDifference !== 0
      ? lengthDifference
      : compareNaturalTextValues(a.strValue, b.strValue);
  }

  // Обе строки — лексикографически (ru locale)
  return compareNaturalTextValues(a.strValue, b.strValue);
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

const MIN_SORT_PAD_LENGTH = 9;
const MIN_SQUARE_SIDE_PAD_LENGTH = 4;

function getScaledSortNumber(numValue: number, multiplier: number): number {
  return Math.round(numValue * multiplier);
}

function getDigitLength(numValue: number): number {
  return String(Math.abs(numValue)).length;
}

export function determineSortFormat(
  values: ParsedValue[],
  multiplier: number,
): SortFormatConfig {
  let maxNumberDigits = 1;
  let maxSquareSideDigits = MIN_SQUARE_SIDE_PAD_LENGTH;

  values.forEach((value) => {
    if (value.type !== "number") {
      return;
    }

    const scaledPrimary = getScaledSortNumber(value.numValue, multiplier);
    maxNumberDigits = Math.max(maxNumberDigits, getDigitLength(scaledPrimary));

    if (value.subtype === "square" && value.secondaryNumValue !== undefined) {
      const scaledSecondary = getScaledSortNumber(value.secondaryNumValue, multiplier);
      maxSquareSideDigits = Math.max(
        maxSquareSideDigits,
        getDigitLength(scaledPrimary),
        getDigitLength(scaledSecondary),
      );
    }
  });

  return {
    padLength: Math.max(
      MIN_SORT_PAD_LENGTH,
      maxNumberDigits + 1,
      maxSquareSideDigits * 2 + 1,
    ),
    squareSidePadLength: maxSquareSideDigits,
  };
}

function normalizeSortFormatConfig(format: SortFormatConfig | number): SortFormatConfig {
  if (typeof format !== "number") {
    return format;
  }

  return {
    padLength: format,
    squareSidePadLength: Math.max(
      MIN_SQUARE_SIDE_PAD_LENGTH,
      Math.floor((format - 1) / 2),
    ),
  };
}

function canUseCompositeSquareSortValue(value: ParsedValue, multiplier: number): boolean {
  const secondaryNumValue = value.secondaryNumValue;
  const scaledPrimary = getScaledSortNumber(value.numValue, multiplier);
  const scaledSecondary =
    secondaryNumValue === undefined ? Number.NaN : getScaledSortNumber(secondaryNumValue, multiplier);

  return (
    value.subtype === "square" &&
    secondaryNumValue !== undefined &&
    Number.isFinite(scaledPrimary) &&
    Number.isFinite(scaledSecondary) &&
    scaledPrimary >= 0 &&
    scaledSecondary >= 0
  );
}

function formatCompositeSquareSortValue(
  value: ParsedValue,
  multiplier: number,
  config: SortFormatConfig,
): string {
  const first = String(getScaledSortNumber(value.numValue, multiplier)).padStart(
    config.squareSidePadLength,
    "0",
  );
  const second = String(getScaledSortNumber(value.secondaryNumValue ?? 0, multiplier)).padStart(
    config.squareSidePadLength,
    "0",
  );
  return `${SORT_SUBTYPE_OFFSET.square}${first}${second}`;
}

export function formatSortValue(
  value: ParsedValue,
  multiplier: number,
  format: SortFormatConfig | number = determineSortFormat([value], multiplier),
): string {
  if (value.type !== "number") {
    return "";
  }

  const config = normalizeSortFormatConfig(format);

  if (canUseCompositeSquareSortValue(value, multiplier)) {
    return formatCompositeSquareSortValue(value, multiplier, config);
  }

  return formatSortValueFromNumber(value.numValue, multiplier, config.padLength, value.subtype);
}

export function formatSortValueFromNumber(
  numValue: number,
  multiplier: number,
  padLength: number = 6,
  subtype: ParsedValue["subtype"] = "default",
): string {
  const sortNumber = getScaledSortNumber(numValue, multiplier);
  const categoryOffset = SORT_SUBTYPE_OFFSET[subtype] ?? SORT_SUBTYPE_OFFSET.default;
  const groupBase = Math.pow(10, Math.max(padLength - 1, 1));
  const fullSortValue = categoryOffset * groupBase + sortNumber;
  return String(fullSortValue).padStart(padLength, "0");
}
