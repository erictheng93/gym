import { describe, it, expect } from 'vitest'
import {
  APP_NAME,
  APP_DESCRIPTION,
  STORAGE_KEYS,
  TIMING,
  PAGINATION,
  STATUS,
  LABELS,
  MESSAGES,
} from './index'

describe('constants', () => {
  describe('App Info', () => {
    it('should have correct app name', () => {
      expect(APP_NAME).toBe('Gym Nexus')
    })

    it('should have correct app description', () => {
      expect(APP_DESCRIPTION).toBe('智慧健身房管理系統')
    })
  })

  describe('STORAGE_KEYS', () => {
    it('should have theme key', () => {
      expect(STORAGE_KEYS.THEME).toBe('gym-nexus-theme')
    })

    it('should have auth token key', () => {
      expect(STORAGE_KEYS.AUTH_TOKEN).toBe('gym-nexus-auth-token')
    })

    it('should have user preferences key', () => {
      expect(STORAGE_KEYS.USER_PREFERENCES).toBe('gym-nexus-user-prefs')
    })
  })

  describe('TIMING', () => {
    it('should have correct timing values', () => {
      expect(TIMING.SHAKE_DURATION).toBe(500)
      expect(TIMING.TOAST_DURATION).toBe(3000)
      expect(TIMING.DEBOUNCE).toBe(300)
      expect(TIMING.TRANSITION_FAST).toBe(150)
      expect(TIMING.TRANSITION_NORMAL).toBe(300)
      expect(TIMING.TRANSITION_SLOW).toBe(500)
    })
  })

  describe('PAGINATION', () => {
    it('should have correct default page size', () => {
      expect(PAGINATION.DEFAULT_PAGE_SIZE).toBe(20)
    })

    it('should have page size options', () => {
      expect(PAGINATION.PAGE_SIZE_OPTIONS).toEqual([10, 20, 50, 100])
    })
  })

  describe('STATUS', () => {
    it('should have contract status labels', () => {
      expect(STATUS.CONTRACT.ACTIVE).toBe('有效')
      expect(STATUS.CONTRACT.EXPIRED).toBe('過期')
      expect(STATUS.CONTRACT.PAUSED).toBe('暫停')
      expect(STATUS.CONTRACT.DRAFT).toBe('草稿')
      expect(STATUS.CONTRACT.TERMINATED).toBe('終止')
    })

    it('should have member status labels', () => {
      expect(STATUS.MEMBER.ACTIVE).toBe('有效')
      expect(STATUS.MEMBER.EXPIRED).toBe('過期')
      expect(STATUS.MEMBER.SUSPENDED).toBe('停權')
      expect(STATUS.MEMBER.PAUSED).toBe('暫停')
    })

    it('should have payment status labels', () => {
      expect(STATUS.PAYMENT.PAID).toBe('已付款')
      expect(STATUS.PAYMENT.UNPAID).toBe('未付款')
      expect(STATUS.PAYMENT.PARTIAL).toBe('部分付款')
      expect(STATUS.PAYMENT.REFUNDED).toBe('已退款')
    })
  })

  describe('LABELS', () => {
    it('should have gender labels', () => {
      expect(LABELS.GENDER.MALE).toBe('男')
      expect(LABELS.GENDER.FEMALE).toBe('女')
      expect(LABELS.GENDER.OTHER).toBe('其他')
    })

    it('should have branch type labels', () => {
      expect(LABELS.BRANCH_TYPE.HEADQUARTER).toBe('總店')
      expect(LABELS.BRANCH_TYPE.BRANCH).toBe('分店')
    })

    it('should have contract type labels', () => {
      expect(LABELS.CONTRACT_TYPE.TIME_BASED).toBe('期限制')
      expect(LABELS.CONTRACT_TYPE.COUNT_BASED).toBe('計次制')
    })

    it('should have payment method labels', () => {
      expect(LABELS.PAYMENT_METHOD.CASH).toBe('現金')
      expect(LABELS.PAYMENT_METHOD.CREDIT_CARD).toBe('信用卡')
      expect(LABELS.PAYMENT_METHOD.LINE_PAY).toBe('LINE Pay')
      expect(LABELS.PAYMENT_METHOD.BANK_TRANSFER).toBe('匯款')
    })
  })

  describe('MESSAGES', () => {
    describe('AUTH messages', () => {
      it('should have login messages', () => {
        expect(MESSAGES.AUTH.LOGIN).toBe('登入')
        expect(MESSAGES.AUTH.LOGOUT).toBe('登出')
        expect(MESSAGES.AUTH.LOGIN_ERROR).toBe('登入失敗，請確認帳號密碼')
      })
    })

    describe('FORM messages', () => {
      it('should have form field labels', () => {
        expect(MESSAGES.FORM.EMAIL).toBe('電子郵件')
        expect(MESSAGES.FORM.PASSWORD).toBe('密碼')
        expect(MESSAGES.FORM.SUBMIT).toBe('送出')
        expect(MESSAGES.FORM.CANCEL).toBe('取消')
      })
    })

    describe('ACTIONS messages', () => {
      it('should have action labels', () => {
        expect(MESSAGES.ACTIONS.CONFIRM).toBe('確認')
        expect(MESSAGES.ACTIONS.LOADING).toBe('載入中...')
        expect(MESSAGES.ACTIONS.NO_DATA).toBe('暫無資料')
      })
    })

    describe('ERRORS messages', () => {
      it('should have error messages', () => {
        expect(MESSAGES.ERRORS.GENERIC).toBe('發生錯誤，請稍後再試')
        expect(MESSAGES.ERRORS.NETWORK).toBe('網路連線錯誤')
        expect(MESSAGES.ERRORS.NOT_FOUND).toBe('找不到資料')
      })
    })

    describe('SUCCESS messages', () => {
      it('should have success messages', () => {
        expect(MESSAGES.SUCCESS.SAVED).toBe('儲存成功')
        expect(MESSAGES.SUCCESS.DELETED).toBe('刪除成功')
        expect(MESSAGES.SUCCESS.CREATED).toBe('建立成功')
      })
    })
  })
})
