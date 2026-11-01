/**
 * 献立食材リスト - アプリケーション初期化 & イベント制御 (js/app.js)
 * 準拠仕様: 献立食材リスト 詳細仕様書 20260915 v1.1.0
 */

(function () {
  'use strict';

  const Calc = window.MenuCalc || {};
  const State = window.MenuState || {};
  const Render = window.MenuRender || {};
  const allRecipes = window.RECIPES || [];

  // アプリケーション状態の復元
  const state = State.loadState ? State.loadState(localStorage) : State.createInitialState();

  // UIローカル状態
  let searchQuery = '';
  let activeCategory = 'すべて';
  let toastTimer = null;

  function getSelectedRecipes() {
    const idSet = new Set(state.selectedMenuIds || []);
    return allRecipes.filter((r) => idSet.has(r.id));
  }

  function getMergedShoppingList() {
    const selected = getSelectedRecipes();
    return Calc.mergeIngredients ? Calc.mergeIngredients(selected, state.servings) : [];
  }

  function persistState() {
    if (State.saveState) {
      const ok = State.saveState(state, localStorage);
      if (!ok && typeof localStorage !== 'undefined') {
        showToast('⚠️ ストレージ制限のため保存に失敗しました', true);
      }
    }
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn('Clipboard APIフォールバック:', e);
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      console.error('コピー失敗:', err);
      return false;
    }
  }

  function showToast(msg = 'コピーしました！', isError = false) {
    const toast = document.getElementById('toast-message');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-show');
      toast.classList.remove('is-error');
    }, isError ? 3500 : 2000);
  }

  function filterRecipes() {
    const q = (searchQuery || '').trim().toLowerCase();
    return allRecipes.filter((recipe) => {
      const matchCat = activeCategory === 'すべて' || recipe.category === activeCategory;
      if (!matchCat) return false;
      if (!q) return true;

      if (recipe.name.toLowerCase().includes(q)) return true;
      if (recipe.ingredients && recipe.ingredients.some((i) => i.name.toLowerCase().includes(q) || i.mergeName.toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }

  const MenuApp = {
    state,
    allRecipes,

    init() {
      // 料理データ未ロード時の安全なフォールバック表示
      if (!allRecipes || allRecipes.length === 0) {
        const container = document.getElementById('menu-cards-container');
        if (Render.renderLoadError) {
          Render.renderLoadError(container);
        }
        return;
      }

      MenuApp.bindEvents();
      MenuApp.syncControlsFromState();
      MenuApp.render();
    },

    syncControlsFromState() {
      const buttons = document.querySelectorAll('#servings-selector .serving-btn');
      buttons.forEach((btn) => {
        const val = parseInt(btn.getAttribute('data-servings'), 10);
        btn.classList.toggle('is-active', val === state.servings);
      });

      const hideSeasoningEl = document.getElementById('hide-seasoning-toggle');
      if (hideSeasoningEl) hideSeasoningEl.checked = state.hideSeasoning;

      const excludeCheckedEl = document.getElementById('exclude-checked-toggle');
      if (excludeCheckedEl) excludeCheckedEl.checked = state.excludeCheckedOnCopy;
    },

    bindEvents() {
      // 人数選択
      const servingsSelector = document.getElementById('servings-selector');
      if (servingsSelector) {
        servingsSelector.addEventListener('click', (e) => {
          const btn = e.target.closest('.serving-btn');
          if (!btn) return;
          const val = parseInt(btn.getAttribute('data-servings'), 10);
          if (val) {
            const beforeItems = getMergedShoppingList();
            state.servings = val;
            const uncheckedChanged = State.uncheckChangedIngredients(state, beforeItems, getMergedShoppingList());
            persistState();
            MenuApp.syncControlsFromState();
            MenuApp.renderShoppingList();
            if (uncheckedChanged) showToast('人数を変えたため、分量が変わった食材のチェックを外しました');
          }
        });
      }

      // 検索入力
      const searchInput = document.getElementById('recipe-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchQuery = e.target.value;
          MenuApp.renderMenuCards();
        });
      }

      // カテゴリタブ
      const categoryTabs = document.getElementById('category-tabs');
      if (categoryTabs) {
        categoryTabs.addEventListener('click', (e) => {
          const tab = e.target.closest('.cat-tab');
          if (!tab) return;
          activeCategory = tab.getAttribute('data-cat') || 'すべて';
          categoryTabs.querySelectorAll('.cat-tab').forEach((t) => t.classList.remove('is-active'));
          tab.classList.add('is-active');
          MenuApp.renderMenuCards();
        });
      }

      // 調味料トグル
      const hideSeasoningEl = document.getElementById('hide-seasoning-toggle');
      if (hideSeasoningEl) {
        hideSeasoningEl.addEventListener('change', (e) => {
          state.hideSeasoning = e.target.checked;
          persistState();
          MenuApp.renderShoppingList();
        });
      }

      // コピー時チェック除外トグル
      const excludeCheckedEl = document.getElementById('exclude-checked-toggle');
      if (excludeCheckedEl) {
        excludeCheckedEl.addEventListener('change', (e) => {
          state.excludeCheckedOnCopy = e.target.checked;
          persistState();
        });
      }

      // リストコピー
      const copyBtn = document.getElementById('copy-clipboard-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const selected = getSelectedRecipes();
          const merged = getMergedShoppingList();
          const text = State.formatClipboardText(
            selected,
            merged,
            state.servings,
            state.checkedItems,
            state.excludeCheckedOnCopy
          );
          const ok = await copyText(text);
          if (ok) {
            showToast('📋 リストをコピーしました！');
            return;
          }
          // 失敗時は、全文を選択して手動コピーできるよう提示する (R-05)
          try {
            if (typeof window.prompt === 'function') {
              window.prompt('コピーできませんでした。以下のテキストを選択してコピーしてください。', text);
            }
          } catch (err) {
            console.warn('手動コピー用のテキスト表示に失敗しました:', err);
          }
          showToast('コピーできませんでした。表示されたテキストを選択してコピーしてください', true);
        });
      }

      // 選択クリア
      const clearBtn = document.getElementById('clear-selection-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          State.clearState(state, localStorage);
          MenuApp.syncControlsFromState();
          MenuApp.render();
          showToast('選択をクリアしました');
        });
      }

      // 買い物リストへスクロール
      const scrollBtn = document.getElementById('scroll-to-shopping-btn');
      if (scrollBtn) {
        scrollBtn.addEventListener('click', () => {
          const section = document.getElementById('shopping-section');
          if (section) section.scrollIntoView({ behavior: 'smooth' });
        });
      }
    },

    toggleMenu(menuId) {
      const beforeItems = getMergedShoppingList();
      State.toggleMenuSelection(state, menuId);
      const uncheckedChanged = State.uncheckChangedIngredients(state, beforeItems, getMergedShoppingList());
      persistState();
      MenuApp.renderMenuCards();
      MenuApp.renderFloatingBar();
      MenuApp.renderShoppingList();
      if (uncheckedChanged) showToast('料理を変えたため、分量が変わった食材のチェックを外しました');
    },

    toggleCheck(itemOrKey) {
      State.toggleIngredientCheck(state, itemOrKey);
      persistState();
      MenuApp.renderShoppingList();
    },

    render() {
      MenuApp.renderMenuCards();
      MenuApp.renderFloatingBar();
      MenuApp.renderShoppingList();
    },

    renderMenuCards() {
      const container = document.getElementById('menu-cards-container');
      const countEl = document.getElementById('visible-recipes-count');
      const filtered = filterRecipes();
      const selectedSet = new Set(state.selectedMenuIds || []);
      Render.renderMenuCards(container, countEl, filtered, allRecipes.length, selectedSet, (id) => {
        MenuApp.toggleMenu(id);
      });
    },

    renderFloatingBar() {
      const bar = document.getElementById('floating-bar');
      const countEl = document.getElementById('selected-count');
      const namesEl = document.getElementById('selected-names');
      const selected = getSelectedRecipes();
      Render.renderFloatingBar(bar, countEl, namesEl, selected);
    },

    renderShoppingList() {
      const container = document.getElementById('shopping-list-items');
      const merged = getMergedShoppingList();
      const checkedSet = new Set(state.checkedItems || []);
      Render.renderShoppingList(container, merged, checkedSet, state.hideSeasoning, (item) => {
        MenuApp.toggleCheck(item);
      });
    }
  };

  window.MenuApp = MenuApp;

  // グローバル例外ハンドラ（安全なフォールバックとログ）
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      console.warn('グローバルエラーを検知しました:', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.warn('未処理Promise例外を検知しました:', event.reason);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    MenuApp.init();
  });
})();

