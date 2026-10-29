/**
 * 献立食材リスト - コア計算・食材マージモジュール (js/calc.js)
 * 準拠仕様: 献立食材リスト 詳細仕様書 20260915 v1.1.0
 */

/**
 * 単位別端数・丸め処理 (仕様書 5.2)
 * @param {number|null} amount - 計算後の分量
 * @param {string} unit - 単位
 * @returns {number|null} 丸め処理後の分量
 */
function roundAmount(amount, unit) {
  if (amount === null || typeof amount !== 'number' || isNaN(amount)) {
    return null;
  }

  const cleanUnit = (unit || '').trim();

  // 1. g / ml: 原則四捨五入して整数（5未満は切り上げ、最小1）
  if (cleanUnit === 'g' || cleanUnit === 'ml') {
    if (amount <= 0) return 0;
    if (amount < 5) {
      return Math.ceil(amount);
    }
    return Math.round(amount);
  }

  // 2. 個 / 本 / 丁 / 束 / パック: 0.5単位で四捨五入（最小0.5）
  if (['個', '本', '丁', '束', 'パック', '株', '袋', '缶'].includes(cleanUnit)) {
    if (amount <= 0) return 0;
    const rounded = Math.round(amount * 2) / 2;
    return rounded === 0 ? 0.5 : rounded;
  }

  // 3. 大さじ / 小さじ: 小数第1位で四捨五入
  if (cleanUnit === '大さじ' || cleanUnit === '小さじ') {
    if (amount <= 0) return 0;
    return Math.round(amount * 10) / 10;
  }

  // 4. かけ / 切れ / 枚 / 片 / 房 / 握り: 0.5単位（最小0.5）
  if (['かけ', '切れ', '枚', '片', '房', '握り'].includes(cleanUnit)) {
    if (amount <= 0) return 0;
    const rounded = Math.round(amount * 2) / 2;
    return rounded === 0 ? 0.5 : rounded;
  }

  // 5. 適量 / 少々 / お好みで 等の非数値材料
  if (['少々', '適量', 'お好みで', '適宜'].includes(cleanUnit)) {
    return null;
  }

  // その他の単位: 小数第1位で四捨五入
  return Math.round(amount * 10) / 10;
}

/**
 * 食材の分量表示用フォーマット
 * @param {number|null} roundedAmount - 丸め済み分量
 * @param {string} unit - 単位
 * @returns {string} 表示文字列（例: "300g", "1.5個", "少々"）
 */
function formatAmount(roundedAmount, unit) {
  if (roundedAmount === null || roundedAmount === undefined) {
    return unit || '';
  }
  return `${roundedAmount}${unit}`;
}

/**
 * 単一食材の人数換算分量計算 (仕様書 5.1)
 * @param {number|null} baseAmount - 基準分量 A
 * @param {number} baseServings - 基準人数 B
 * @param {number} targetServings - 指定人数 S
 * @returns {number|null} 計算後分量 (A * (S / B))
 */
function calculateIngredientAmount(baseAmount, baseServings, targetServings) {
  if (baseAmount === null || typeof baseAmount !== 'number' || isNaN(baseAmount)) {
    return null;
  }
  if (!baseServings || baseServings <= 0 || !targetServings || targetServings <= 0) {
    return baseAmount;
  }
  return (baseAmount * targetServings) / baseServings;
}

/**
 * キー比較用の文字列正規化（空白除去、Unicode正規化、小文字化）
 * @param {string} str
 * @returns {string}
 */
function normalizeKeyPart(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * 食材の不変グループキーを生成
 * @param {string} mergeName
 * @param {string} unit
 * @param {boolean} isNonNumeric
 * @returns {string}
 */
function createIngredientKey(mergeName, unit, isNonNumeric = false) {
  const normName = normalizeKeyPart(mergeName);
  const normUnit = normalizeKeyPart(unit);
  return isNonNumeric
    ? `${normName}___${normUnit}___nonnumeric`
    : `${normName}___${normUnit}`;
}

/**
 * 複数料理から食材を統合・合算・重複排除し買い物リスト用配列を生成 (仕様書 7 & 8)
 * @param {Array<Object>} selectedRecipes - 選択されたレシピ配列
 * @param {number} targetServings - 指定人数
 * @returns {Array<Object>} マージ後の食材リスト
 */
function mergeIngredients(selectedRecipes, targetServings = 2) {
  if (!Array.isArray(selectedRecipes) || selectedRecipes.length === 0) {
    return [];
  }

  // マージバケット
  // key -> { mergeName, unit, isSeasoning, rawTotalAmount, originRecipes: Set, originNames: Set, isNonNumeric }
  const groups = new Map();

  selectedRecipes.forEach((recipe) => {
    const baseServings = recipe.baseServings || 2;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

    ingredients.forEach((ing) => {
      const mergeName = (ing.mergeName || ing.name || '').trim();
      const unit = (ing.unit || '').trim();
      const isSeasoning = Boolean(ing.isSeasoning);
      const isNonNumeric = ing.amount === null || typeof ing.amount !== 'number';

      // 7.1 & 7.2 統合キーの決定（正規化キー）
      const canonicalKey = createIngredientKey(mergeName, unit, isNonNumeric);
      // 後方互換用の旧形式rawキー
      const rawKey = isNonNumeric
        ? `${mergeName}___${unit}___nonnumeric`
        : `${mergeName}___${unit}`;

      const calculatedAmount = isNonNumeric
        ? null
        : calculateIngredientAmount(ing.amount, baseServings, targetServings);

      if (!groups.has(canonicalKey)) {
        groups.set(canonicalKey, {
          key: canonicalKey,
          rawKey: rawKey,
          mergeName: mergeName,
          unit: unit,
          isSeasoning: isSeasoning,
          isNonNumeric: isNonNumeric,
          rawTotalAmount: isNonNumeric ? null : calculatedAmount,
          originRecipes: [recipe.name],
          originNames: [ing.name]
        });
      } else {
        const item = groups.get(canonicalKey);
        if (!isNonNumeric && calculatedAmount !== null) {
          item.rawTotalAmount = (item.rawTotalAmount || 0) + calculatedAmount;
        }
        if (!item.originRecipes.includes(recipe.name)) {
          item.originRecipes.push(recipe.name);
        }
        if (!item.originNames.includes(ing.name)) {
          item.originNames.push(ing.name);
        }
        // 調味料フラグ: 一方でも一般食材なら一般食材として扱う（安全側に倒す）
        if (!isSeasoning) {
          item.isSeasoning = false;
        }
      }
    });
  });

  // 結果の整形と丸め処理
  const result = Array.from(groups.values()).map((item) => {
    const roundedAmount = item.isNonNumeric
      ? null
      : roundAmount(item.rawTotalAmount, item.unit);

    // 表記揺れや過去バージョンとの互換性を保証するエイリアスキー群
    const aliasKeys = new Set([
      item.key,
      item.rawKey,
      `${item.mergeName}___${item.unit}`,
      createIngredientKey(item.mergeName, item.unit, false)
    ]);
    item.originNames.forEach((origName) => {
      aliasKeys.add(createIngredientKey(origName, item.unit, item.isNonNumeric));
      aliasKeys.add(`${origName}___${item.unit}`);
    });

    return {
      key: item.key,
      aliasKeys: Array.from(aliasKeys),
      name: item.mergeName,
      amount: roundedAmount,
      rawAmount: item.rawTotalAmount,
      unit: item.unit,
      displayAmount: formatAmount(roundedAmount, item.unit),
      isSeasoning: item.isSeasoning,
      isNonNumeric: item.isNonNumeric,
      originRecipes: item.originRecipes,
      originNames: item.originNames
    };
  });

  // 8.2 表示グループ分けソート:
  // 1. 一般食材 (isSeasoning === false) が先頭、調味料 (isSeasoning === true) が後方
  // 2. それぞれ名前順（日本語ロケール比較）
  result.sort((a, b) => {
    if (a.isSeasoning !== b.isSeasoning) {
      return a.isSeasoning ? 1 : -1;
    }
    return a.name.localeCompare(b.name, 'ja');
  });

  return result;
}

// Node.js / ブラウザ両対応エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeKeyPart,
    createIngredientKey,
    roundAmount,
    formatAmount,
    calculateIngredientAmount,
    mergeIngredients
  };
}
if (typeof window !== 'undefined') {
  window.MenuCalc = {
    normalizeKeyPart,
    createIngredientKey,
    roundAmount,
    formatAmount,
    calculateIngredientAmount,
    mergeIngredients
  };
}
