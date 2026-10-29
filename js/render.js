/**
 * 献立食材リスト - UIレンダリングモジュール (js/render.js)
 * 準拠仕様: 献立食材リスト 詳細仕様書 20260915 v1.1.0
 */

(function () {
  'use strict';

  /**
   * 安全なHTMLエスケープ処理
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const MenuRender = {
    escapeHtml,

    /**
     * データ読み込みエラーアラートの描画
     */
    renderLoadError(container, message = '料理データの読み込みに失敗しました。ファイル配置をご確認ください。') {
      if (!container) return;
      container.innerHTML = `
        <div class="error-banner" role="alert">
          <div class="error-banner-icon">⚠️</div>
          <div class="error-banner-body">
            <strong>データエラー</strong>
            <p>${escapeHtml(message)}</p>
          </div>
        </div>
      `;
    },

    /**
     * メニューカード一覧の描画
     */
    renderMenuCards(container, countEl, filteredRecipes, totalCount, selectedSet, onToggleMenu) {
      if (!container) return;

      if (countEl) {
        countEl.textContent = `${totalCount}品中 ${filteredRecipes.length}品表示`;
      }

      if (filteredRecipes.length === 0) {
        container.innerHTML = '<div class="empty-list-msg">該当する料理が見つかりませんでした。</div>';
        return;
      }

      let html = '';
      filteredRecipes.forEach((recipe) => {
        const isSelected = selectedSet.has(recipe.id);
        const ingPreview = (recipe.ingredients || [])
          .slice(0, 3)
          .map((i) => i.name)
          .join('、');

        html += `
          <div class="menu-card ${isSelected ? 'is-selected' : ''}"
               data-id="${escapeHtml(recipe.id)}"
               role="button"
               tabindex="0"
               aria-pressed="${isSelected}">
            <div>
              <div class="card-header">
                <span class="card-title">${escapeHtml(recipe.name)}</span>
                <span class="card-select-indicator">${isSelected ? '✓' : ''}</span>
              </div>
              <div class="card-category">${escapeHtml(recipe.category)}</div>
            </div>
            <div class="card-ingredients" title="${escapeHtml(ingPreview)}">${escapeHtml(ingPreview)} 等</div>
          </div>
        `;
      });

      container.innerHTML = html;

      container.querySelectorAll('.menu-card').forEach((card) => {
        const handleToggle = () => {
          const id = card.getAttribute('data-id');
          if (onToggleMenu) onToggleMenu(id);
        };

        card.addEventListener('click', handleToggle);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        });
      });
    },

    /**
     * 固定下部バーの描画
     */
    renderFloatingBar(bar, countEl, namesEl, selectedRecipes) {
      if (!bar) return;

      if (selectedRecipes.length === 0) {
        bar.classList.add('is-hidden');
        return;
      }

      bar.classList.remove('is-hidden');
      if (countEl) countEl.textContent = `${selectedRecipes.length}品`;
      if (namesEl) namesEl.textContent = selectedRecipes.map((r) => r.name).join(', ');
    },

    /**
     * 買い物リストの描画
     */
    renderShoppingList(container, mergedList, checkedSet, hideSeasoning, onToggleCheck) {
      if (!container) return;

      if (mergedList.length === 0) {
        container.innerHTML = '<div class="empty-list-msg">料理を選ぶと、買い物用リストが自動作成されます。</div>';
        return;
      }

      const displayItems = hideSeasoning
        ? mergedList.filter((item) => !item.isSeasoning)
        : mergedList;

      if (displayItems.length === 0) {
        container.innerHTML = '<div class="empty-list-msg">調味料以外の食材はありません。</div>';
        return;
      }

      let html = '';
      let currentSection = null;

      displayItems.forEach((item, index) => {
        // エイリアス含むチェック判定
        const isChecked = checkedSet.has(item.key) ||
          (Array.isArray(item.aliasKeys) && item.aliasKeys.some((k) => checkedSet.has(k)));

        const sectionTitle = item.isSeasoning ? '調味料' : '生鮮・一般食材';

        if (currentSection !== sectionTitle) {
          currentSection = sectionTitle;
          html += `<div class="shopping-group-title ${item.isSeasoning ? 'seasoning-title' : ''}">${escapeHtml(sectionTitle)}</div>`;
        }

        html += `
          <div class="shopping-item ${isChecked ? 'is-checked' : ''}" data-index="${index}" role="listitem">
            <label class="item-label">
              <input type="checkbox" class="item-checkbox" ${isChecked ? 'checked' : ''} data-index="${index}">
              <span class="item-name">${escapeHtml(item.name)}</span>
            </label>
            <span class="item-amount">${escapeHtml(item.displayAmount)}</span>
          </div>
        `;
      });

      container.innerHTML = html;

      container.querySelectorAll('.item-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'), 10);
          const targetItem = displayItems[idx];
          if (onToggleCheck && targetItem) {
            onToggleCheck(targetItem);
          }
        });
      });
    }
  };

  window.MenuRender = MenuRender;
})();
