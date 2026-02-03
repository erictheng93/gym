import { Page, Locator } from '@playwright/test'

/**
 * 測試等待輔助工具
 * 提供更精確的等待方法替代 page.waitForTimeout()
 */

/**
 * 等待網絡請求完成
 * @param page Playwright Page 實例
 * @param urlPattern 要等待的 URL 模式（字符串或正則表達式）
 * @param timeout 超時時間（毫秒）
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 5000
): Promise<void> {
  await page.waitForResponse(
    (response) => {
      const url = response.url()
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern)
      }
      return urlPattern.test(url)
    },
    { timeout }
  )
}

/**
 * 等待元素可見並穩定（不再移動）
 * @param locator 元素定位器
 * @param timeout 超時時間（毫秒）
 */
export async function waitForElementStable(
  locator: Locator,
  timeout = 5000
): Promise<void> {
  // 先等待元素可見
  await locator.waitFor({ state: 'visible', timeout })

  // 等待元素穩定（位置不再變化）
  let previousBox = await locator.boundingBox()
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    await locator.page().waitForTimeout(100)
    const currentBox = await locator.boundingBox()

    if (
      previousBox &&
      currentBox &&
      previousBox.x === currentBox.x &&
      previousBox.y === currentBox.y &&
      previousBox.width === currentBox.width &&
      previousBox.height === currentBox.height
    ) {
      return
    }

    previousBox = currentBox
  }

  throw new Error(`Element did not stabilize within ${timeout}ms`)
}

/**
 * 等待表格或列表數據加載完成
 * @param page Playwright Page 實例
 * @param tableSelector 表格選擇器
 * @param minRows 最少期望的行數
 * @param timeout 超時時間（毫秒）
 */
export async function waitForTableData(
  page: Page,
  tableSelector: string,
  minRows = 0,
  timeout = 5000
): Promise<void> {
  const table = page.locator(tableSelector)
  await table.waitFor({ state: 'visible', timeout })

  // 等待數據行出現
  const rows = table.locator('tbody tr, [role="row"]')
  await rows.first().waitFor({ state: 'visible', timeout }).catch(() => {
    // 如果沒有數據行，檢查是否有空狀態提示
    if (minRows === 0) return
    throw new Error('No data rows found')
  })

  // 如果有最小行數要求，驗證行數
  if (minRows > 0) {
    await page.waitForFunction(
      ({ selector, min }) => {
        const table = document.querySelector(selector)
        if (!table) return false
        const rows = table.querySelectorAll('tbody tr, [role="row"]')
        return rows.length >= min
      },
      { selector: tableSelector, min: minRows },
      { timeout }
    )
  }
}

/**
 * 等待成功訊息出現並消失
 * @param page Playwright Page 實例
 * @param messageText 訊息文本（可選）
 * @param timeout 超時時間（毫秒）
 */
export async function waitForSuccessMessage(
  page: Page,
  messageText?: string,
  timeout = 5000
): Promise<void> {
  let messageLocator = page.locator('.success-message, .toast, .notification')

  if (messageText) {
    messageLocator = messageLocator.filter({ hasText: messageText })
  } else {
    messageLocator = messageLocator.filter({ hasText: /成功|Success/ })
  }

  // 等待訊息出現
  await messageLocator.first().waitFor({ state: 'visible', timeout })
}

/**
 * 等待表單提交完成（等待按鈕恢復可用狀態）
 * @param submitButton 提交按鈕定位器
 * @param timeout 超時時間（毫秒）
 */
export async function waitForFormSubmission(
  submitButton: Locator,
  timeout = 10000
): Promise<void> {
  // 等待按鈕變為禁用狀態（提交中）
  try {
    await submitButton.page().waitForFunction(
      (btn) => btn?.hasAttribute('disabled'),
      await submitButton.elementHandle(),
      { timeout: 1000 }
    )
  } catch {
    // 按鈕可能沒有禁用狀態，繼續執行
  }

  // 等待按鈕恢復可用狀態
  await submitButton.waitFor({ state: 'visible', timeout })
  await submitButton.page().waitForLoadState('networkidle', { timeout })
}

/**
 * 等待搜尋結果更新
 * @param page Playwright Page 實例
 * @param searchInput 搜尋輸入框定位器
 * @param searchTerm 搜尋詞
 * @param resultSelector 結果選擇器
 * @param timeout 超時時間（毫秒）
 */
export async function waitForSearchResults(
  page: Page,
  searchInput: Locator,
  searchTerm: string,
  resultSelector: string,
  timeout = 5000
): Promise<void> {
  // 監聽網絡請求
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/items/') ||
      response.url().includes('/search') ||
      response.url().includes('filter'),
    { timeout }
  ).catch(() => null) // 如果沒有網絡請求，忽略錯誤

  // 輸入搜尋詞
  await searchInput.fill(searchTerm)

  // 等待響應或網絡空閒
  await Promise.race([
    responsePromise,
    page.waitForLoadState('networkidle', { timeout })
  ])

  // 等待結果更新
  const results = page.locator(resultSelector)
  await results.first().waitFor({ state: 'visible', timeout }).catch(() => {
    // 可能沒有結果，這是正常的
  })
}

/**
 * 等待下拉選單選項加載完成
 * @param selectLocator 下拉選單定位器
 * @param minOptions 最少期望的選項數
 * @param timeout 超時時間（毫秒）
 */
export async function waitForSelectOptions(
  selectLocator: Locator,
  minOptions = 1,
  timeout = 5000
): Promise<void> {
  await selectLocator.waitFor({ state: 'visible', timeout })

  await selectLocator.page().waitForFunction(
    ({ selector, min }) => {
      const select = document.querySelector(selector) as HTMLSelectElement
      if (!select) return false
      return select.options.length >= min
    },
    { selector: await selectLocator.evaluate(el => {
      // 獲取元素的唯一選擇器
      if (el.id) return `#${el.id}`
      const htmlEl = el as HTMLSelectElement
      if (htmlEl.name) return `[name="${htmlEl.name}"]`
      return el.tagName
    }), min: minOptions },
    { timeout }
  )
}

/**
 * 等待分頁數據加載
 * @param page Playwright Page 實例
 * @param expectedPage 期望的頁碼
 * @param timeout 超時時間（毫秒）
 */
export async function waitForPagination(
  page: Page,
  expectedPage: number,
  timeout = 5000
): Promise<void> {
  // 等待網絡請求或 URL 變化
  await Promise.race([
    page.waitForResponse(
      (response) =>
        response.url().includes('page=') ||
        response.url().includes('offset=') ||
        response.url().includes('/items/'),
      { timeout }
    ).catch(() => null),
    page.waitForURL(`**/*page=${expectedPage}*`, { timeout }).catch(() => null),
    page.waitForLoadState('networkidle', { timeout })
  ])
}

/**
 * 等待彈窗或對話框出現
 * @param page Playwright Page 實例
 * @param dialogSelector 對話框選擇器
 * @param timeout 超時時間（毫秒）
 */
export async function waitForDialog(
  page: Page,
  dialogSelector: string = '[role="dialog"], .modal, .dialog',
  timeout = 5000
): Promise<Locator> {
  const dialog = page.locator(dialogSelector)
  await dialog.waitFor({ state: 'visible', timeout })
  await waitForElementStable(dialog, timeout)
  return dialog
}

/**
 * 等待過濾結果更新
 * @param page Playwright Page 實例
 * @param filterAction 過濾操作函數
 * @param resultSelector 結果選擇器
 * @param timeout 超時時間（毫秒）
 */
export async function waitForFilterResults(
  page: Page,
  filterAction: () => Promise<void>,
  resultSelector: string,
  timeout = 5000
): Promise<void> {
  // 監聽網絡請求
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/items/') || response.url().includes('filter'),
    { timeout }
  ).catch(() => null)

  // 執行過濾操作
  await filterAction()

  // 等待響應
  await responsePromise

  // 等待結果更新
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null)
}
