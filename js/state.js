/**
 * 献立食材リスト - 状態管理・LocalStorage永続化・テキスト生成モジュール (js/state.js)
 * 準拠仕様: 献立食材リスト 詳細仕様書 20260915 v1.1.0 (項8, 10, 12)
 */

const STORAGE_KEY = 'menu_app_state';

/**
 * 初期状態を生成
 */
function createInitialState() {
  return {
    selectedMenuIds: [],
    servings: 2,
    checkedItems: [],
    hideSeasoning: false,
    excludeCheckedOnCopy: false
  };
}

/**
 * LocalStorage から状態を読み込み
 * @param {Storage} storage - localStorage またはモックストレージ
 * @returns {Object} 復元された状態
 */
function loadState(storage) {
  const defaultState = createInitialState();
  if (!storage) return defaultState;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw);
    return {
      selectedMenuIds: Array.isArray(parsed.selectedMenuIds) ? parsed.selectedMenuIds : [],
      servings: typeof parsed.servings === 'number' && parsed.servings > 0 ? parsed.servings : 2,
      checkedItems: Array.isArray(parsed.checkedItems) ? parsed.checkedItems : [],
      hideSeasoning: Boolean(parsed.hideSeasoning),
      excludeCheckedOnCopy: Boolean(parsed.excludeCheckedOnCopy)
    };
  } catch (e) {
    console.warn('LocalStorageの読み込みに失敗したため初期値を使用します:', e);
    return defaultState;
  }
}

/**
 * 状態を LocalStorage に保存
 * @param {Object} state - アプリ状態
 * @param {Storage} storage - localStorage またはモックストレージ
 * @returns {boolean} 保存に成功したか
 */
function saveState(state, storage) {
  if (!storage || !state) return false;
  try {
    const payload = {
      selectedMenuIds: Array.from(new Set(state.selectedMenuIds || [])),
      servings: state.servings || 2,
      checkedItems: Array.from(new Set(state.checkedItems || [])),
      hideSeasoning: Boolean(state.hideSeasoning),
      excludeCheckedOnCopy: Boolean(state.excludeCheckedOnCopy)
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('LocalStorageへの保存に失敗しました:', e);
    return false;
  }
}

/**
 * 状態およびストレージをリセット
 * @param {Object} state - アプリ状態
 * @param {Storage} storage - localStorage またはモックストレージ
 */
function clearState(state, storage) {
  const initial = createInitialState();
  if (state) {
    state.selectedMenuIds = [];
    state.servings = initial.servings;
    state.checkedItems = [];
    state.hideSeasoning = false;
    state.excludeCheckedOnCopy = false;
  }
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('LocalStorageのクリアに失敗しました:', e);
    }
  }
}

/**
 * メニュー選択の切り替え (トグル)
 */
function toggleMenuSelection(state, menuId) {
  if (!state || !menuId) return;
  const index = state.selectedMenuIds.indexOf(menuId);
  if (index >= 0) {
    state.selectedMenuIds.splice(index, 1);
  } else {
    state.selectedMenuIds.push(menuId);
  }
}

/**
 * 食材がチェック済みかを判定（キーおよびエイリアスキーでの後方互換マッチング）
 * @param {Array<string>} checkedItems - チェック済みキー一覧
 * @param {string|Object} itemOrKey - 食材オブジェクトまたはキー文字列
 * @returns {boolean}
 */
function isItemChecked(checkedItems, itemOrKey) {
  if (!Array.isArray(checkedItems) || !itemOrKey) return false;
  if (typeof itemOrKey === 'string') {
    return checkedItems.includes(itemOrKey);
  }
  if (typeof itemOrKey === 'object') {
    if (itemOrKey.key && checkedItems.includes(itemOrKey.key)) {
      return true;
    }
    if (Array.isArray(itemOrKey.aliasKeys)) {
      return itemOrKey.aliasKeys.some((alias) => checkedItems.includes(alias));
    }
  }
  return false;
}

/**
 * 食材チェックの切り替え (トグル & 自動マイグレーション)
 * @param {Object} state - アプリ状態
 * @param {string|Object} itemOrKey - 食材オブジェクトまたはキー文字列
 */
function toggleIngredientCheck(state, itemOrKey) {
  if (!state || !itemOrKey) return;
  if (!Array.isArray(state.checkedItems)) {
    state.checkedItems = [];
  }

  const primaryKey = typeof itemOrKey === 'object' ? itemOrKey.key : itemOrKey;
  const aliasKeys = typeof itemOrKey === 'object' && Array.isArray(itemOrKey.aliasKeys)
    ? itemOrKey.aliasKeys
    : [primaryKey];

  // 既存リスト内で一致するキー（エイリアス含む）を探索
  const matchedIndices = [];
  state.checkedItems.forEach((savedKey, idx) => {
    if (aliasKeys.includes(savedKey)) {
      matchedIndices.push(idx);
    }
  });

  if (matchedIndices.length > 0) {
    // チェック解除: 一致したキーをすべて削除
    // 逆順で splice してインデックスずれを回避
    for (let i = matchedIndices.length - 1; i >= 0; i--) {
      state.checkedItems.splice(matchedIndices[i], 1);
    }
  } else {
    // チェック追加: 最新の primaryKey で記録（マイグレーション）
    state.checkedItems.push(primaryKey);
  }
}

/**
 * クリップボードコピー用テキストの生成 (仕様書 10.1)
 * @param {Array<Object>} selectedRecipes - 選択された料理オブジェクト配列
 * @param {Array<Object>} mergedIngredients - マージ済み食材リスト
 * @param {number} servings - 指定人数
 * @param {Array<string>} checkedItems - チェック済み食材キー配列
 * @param {boolean} excludeChecked - チェック済み食材を除外するか
 * @returns {string} 出力テキスト
 */
function formatClipboardText(
  selectedRecipes = [],
  mergedIngredients = [],
  servings = 2,
  checkedItems = [],
  excludeChecked = false
) {
  if (selectedRecipes.length === 0) {
    return '【献立】なし\n【買い物リスト】なし';
  }

  const recipeNames = selectedRecipes.map((r) => r.name).join('、');
  const header = `【献立】${recipeNames} (${servings}人分)`;

  // チェック除外フィルタ
  const targetIngredients = excludeChecked
    ? mergedIngredients.filter((item) => !isItemChecked(checkedItems, item))
    : mergedIngredients;

  if (targetIngredients.length === 0) {
    return `${header}\n【買い物リスト】\n（必要な食材はありません）`;
  }

  // 一般食材と調味料に分類
  const regulars = targetIngredients.filter((item) => !item.isSeasoning);
  const seasonings = targetIngredients.filter((item) => item.isSeasoning);

  const lines = [header, '【買い物リスト】'];

  regulars.forEach((item) => {
    lines.push(`・${item.name} ${item.displayAmount}`.trim());
  });

  if (seasonings.length > 0) {
    lines.push('（調味料）');
    seasonings.forEach((item) => {
      lines.push(`・${item.name} ${item.displayAmount}`.trim());
    });
  }

  return lines.join('\n');
}

// Node.js / ブラウザ両対応エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEY,
    createInitialState,
    loadState,
    saveState,
    clearState,
    toggleMenuSelection,
    toggleIngredientCheck,
    isItemChecked,
    formatClipboardText
  };
}
if (typeof window !== 'undefined') {
  window.MenuState = {
    STORAGE_KEY,
    createInitialState,
    loadState,
    saveState,
    clearState,
    toggleMenuSelection,
    toggleIngredientCheck,
    isItemChecked,
    formatClipboardText
  };
}
