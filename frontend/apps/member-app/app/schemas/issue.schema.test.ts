import { describe, it, expect } from 'vitest'
import { createIssueSchema, supportCategoryToIssueType } from './issue.schema'

describe('supportCategoryToIssueType', () => {
  it('maps support categories onto backend issue types', () => {
    expect(supportCategoryToIssueType('facility')).toBe('EQUIPMENT')
    expect(supportCategoryToIssueType('service')).toBe('COMPLAINT')
    expect(supportCategoryToIssueType('booking')).toBe('SERVICE')
    expect(supportCategoryToIssueType('other')).toBe('SERVICE')
  })
})

describe('createIssueSchema content length', () => {
  it('requires at least 10 characters, matching the backend', () => {
    const base = { type: 'SERVICE' as const, title: 't' }
    expect(createIssueSchema.safeParse({ ...base, content: 'short' }).success).toBe(false)
    expect(createIssueSchema.safeParse({ ...base, content: '0123456789' }).success).toBe(true)
  })
})
