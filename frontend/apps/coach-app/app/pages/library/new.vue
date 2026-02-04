<template>
  <div class="form-page">
    <!-- Header -->
    <div class="form-header">
      <button class="back-button" @click="router.back()">
        <svg class="back-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span>返回</span>
      </button>
      <h1 class="page-title">新增教學資源</h1>
      <div class="header-spacer" />
    </div>

    <!-- Form Content -->
    <div class="form-content">
      <form @submit.prevent="handleSubmit">
        <!-- Type Selector -->
        <div class="form-section">
          <h2 class="section-title">資源類型</h2>
          <div class="type-selector">
            <button
              type="button"
              class="type-btn"
              :class="{ active: form.type === 'EXERCISE' }"
              @click="form.type = 'EXERCISE'"
            >
              <span class="type-icon">💪</span>
              <span class="type-label">動作</span>
            </button>
            <button
              type="button"
              class="type-btn"
              :class="{ active: form.type === 'VIDEO' }"
              @click="form.type = 'VIDEO'"
            >
              <span class="type-icon">🎬</span>
              <span class="type-label">影片</span>
            </button>
            <button
              type="button"
              class="type-btn"
              :class="{ active: form.type === 'DOCUMENT' }"
              @click="form.type = 'DOCUMENT'"
            >
              <span class="type-icon">📄</span>
              <span class="type-label">文件</span>
            </button>
          </div>
        </div>

        <!-- Basic Info -->
        <div class="form-section">
          <h2 class="section-title">基本資訊</h2>
          <div class="section-card">
            <div class="form-group">
              <label class="form-label">
                名稱 <span class="required">*</span>
              </label>
              <input
                v-model="form.name"
                type="text"
                required
                class="form-input"
                placeholder="例如：槓鈴深蹲"
              />
            </div>

            <div class="form-group">
              <label class="form-label">分類</label>
              <input
                v-model="form.category"
                type="text"
                class="form-input"
                placeholder="例如：下肢訓練"
              />
            </div>

            <div class="form-group">
              <label class="form-label">難度</label>
              <div class="difficulty-picker">
                <button
                  type="button"
                  class="difficulty-btn beginner"
                  :class="{ active: form.difficulty === 'BEGINNER' }"
                  @click="form.difficulty = form.difficulty === 'BEGINNER' ? '' : 'BEGINNER'"
                >
                  <span class="difficulty-dot" />
                  初階
                </button>
                <button
                  type="button"
                  class="difficulty-btn intermediate"
                  :class="{ active: form.difficulty === 'INTERMEDIATE' }"
                  @click="form.difficulty = form.difficulty === 'INTERMEDIATE' ? '' : 'INTERMEDIATE'"
                >
                  <span class="difficulty-dot" />
                  中階
                </button>
                <button
                  type="button"
                  class="difficulty-btn advanced"
                  :class="{ active: form.difficulty === 'ADVANCED' }"
                  @click="form.difficulty = form.difficulty === 'ADVANCED' ? '' : 'ADVANCED'"
                >
                  <span class="difficulty-dot" />
                  進階
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Muscle Groups & Equipment -->
        <div class="form-section">
          <h2 class="section-title">目標肌群</h2>
          <div class="section-card">
            <div class="tag-list">
              <div
                v-for="(muscle, idx) in form.muscle_groups"
                :key="idx"
                class="tag-item"
              >
                <input
                  v-model="form.muscle_groups[idx]"
                  type="text"
                  class="tag-input"
                  placeholder="例如：股四頭肌"
                />
                <button
                  type="button"
                  class="tag-delete"
                  @click="form.muscle_groups.splice(idx, 1)"
                >
                  ×
                </button>
              </div>
            </div>
            <button type="button" class="add-tag-btn" @click="form.muscle_groups.push('')">
              + 新增肌群
            </button>
          </div>
        </div>

        <div class="form-section">
          <h2 class="section-title">所需器材</h2>
          <div class="section-card">
            <div class="tag-list">
              <div
                v-for="(equip, idx) in form.equipment"
                :key="idx"
                class="tag-item"
              >
                <input
                  v-model="form.equipment[idx]"
                  type="text"
                  class="tag-input"
                  placeholder="例如：槓鈴"
                />
                <button
                  type="button"
                  class="tag-delete"
                  @click="form.equipment.splice(idx, 1)"
                >
                  ×
                </button>
              </div>
            </div>
            <button type="button" class="add-tag-btn" @click="form.equipment.push('')">
              + 新增器材
            </button>
          </div>
        </div>

        <!-- Description -->
        <div class="form-section">
          <h2 class="section-title">說明</h2>
          <div class="section-card">
            <textarea
              v-model="form.description"
              class="form-textarea"
              rows="3"
              placeholder="動作簡介..."
            />
          </div>
        </div>

        <!-- Instructions -->
        <div class="form-section">
          <h2 class="section-title">動作步驟</h2>
          <div class="section-card">
            <div class="step-list">
              <div
                v-for="(step, idx) in form.instructions"
                :key="idx"
                class="step-item"
              >
                <div class="step-number">{{ idx + 1 }}</div>
                <input
                  v-model="form.instructions[idx]"
                  type="text"
                  class="step-input"
                  placeholder="輸入步驟說明"
                />
                <button
                  type="button"
                  class="step-delete"
                  @click="form.instructions.splice(idx, 1)"
                >
                  <svg class="delete-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <button type="button" class="add-item-btn" @click="form.instructions.push('')">
              <svg class="add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              新增步驟
            </button>
          </div>
        </div>

        <!-- Tips -->
        <div class="form-section">
          <h2 class="section-title">教學提示</h2>
          <div class="section-card">
            <div class="list-items">
              <div
                v-for="(tip, idx) in form.tips"
                :key="idx"
                class="list-item"
              >
                <div class="tip-icon">💡</div>
                <input
                  v-model="form.tips[idx]"
                  type="text"
                  class="list-input"
                  placeholder="輸入教學提示"
                />
                <button
                  type="button"
                  class="list-delete"
                  @click="form.tips.splice(idx, 1)"
                >
                  ×
                </button>
              </div>
            </div>
            <button type="button" class="add-item-btn" @click="form.tips.push('')">
              + 新增提示
            </button>
          </div>
        </div>

        <!-- Common Mistakes -->
        <div class="form-section">
          <h2 class="section-title">常見錯誤</h2>
          <div class="section-card">
            <div class="list-items">
              <div
                v-for="(mistake, idx) in form.common_mistakes"
                :key="idx"
                class="list-item"
              >
                <div class="mistake-icon">⚠️</div>
                <input
                  v-model="form.common_mistakes[idx]"
                  type="text"
                  class="list-input"
                  placeholder="輸入常見錯誤"
                />
                <button
                  type="button"
                  class="list-delete"
                  @click="form.common_mistakes.splice(idx, 1)"
                >
                  ×
                </button>
              </div>
            </div>
            <button type="button" class="add-item-btn" @click="form.common_mistakes.push('')">
              + 新增常見錯誤
            </button>
          </div>
        </div>

        <!-- Media URLs -->
        <div class="form-section">
          <h2 class="section-title">媒體連結</h2>
          <div class="section-card">
            <div v-if="form.type === 'VIDEO'" class="form-group">
              <label class="form-label">影片網址</label>
              <input
                v-model="form.video_url"
                type="url"
                class="form-input"
                placeholder="https://youtube.com/..."
              />
            </div>

            <div class="form-group">
              <label class="form-label">縮圖網址</label>
              <input
                v-model="form.thumbnail_url"
                type="url"
                class="form-input"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="submit-section">
          <button
            type="submit"
            class="submit-btn"
            :disabled="submitting || !form.name"
          >
            <span v-if="submitting" class="btn-spinner" />
            {{ submitting ? '儲存中...' : '儲存資源' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { success, error: showError } = useToast()
const { createMaterial } = useTeachingMaterials()

const submitting = ref(false)
const form = ref({
  name: '',
  type: 'EXERCISE' as 'EXERCISE' | 'VIDEO' | 'DOCUMENT',
  category: '',
  difficulty: '',
  muscle_groups: [''] as string[],
  equipment: [''] as string[],
  description: '',
  instructions: [''] as string[],
  tips: [''] as string[],
  common_mistakes: [''] as string[],
  video_url: '',
  thumbnail_url: '',
})

const handleSubmit = async () => {
  submitting.value = true

  const data = {
    name: form.value.name,
    type: form.value.type,
    category: form.value.category || undefined,
    difficulty: form.value.difficulty || undefined,
    muscle_groups: form.value.muscle_groups.filter(m => m.trim()),
    equipment: form.value.equipment.filter(e => e.trim()),
    description: form.value.description || undefined,
    instructions: form.value.instructions.filter(i => i.trim()),
    tips: form.value.tips.filter(t => t.trim()),
    common_mistakes: form.value.common_mistakes.filter(m => m.trim()),
    video_url: form.value.video_url || undefined,
    thumbnail_url: form.value.thumbnail_url || undefined,
  }

  const result = await createMaterial(data)

  if (result.success) {
    success('教學資源已建立')
    router.push('/library')
  } else {
    showError(result.message || '建立失敗')
  }

  submitting.value = false
}
</script>

<style scoped>
.form-page {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

/* Header */
.form-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-bottom: 0.5px solid var(--border-color);
}

.back-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--apple-blue);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.back-icon {
  width: 20px;
  height: 20px;
}

.page-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-spacer {
  width: 60px;
}

/* Form Content */
.form-content {
  padding: 16px;
}

/* Type Selector */
.type-selector {
  display: flex;
  gap: 12px;
}

.type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  background: var(--card-bg);
  border: 2px solid transparent;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
  box-shadow: var(--shadow-sm);
}

.type-btn.active {
  border-color: var(--apple-blue);
  background: rgba(0, 122, 255, 0.08);
}

.type-btn:active {
  transform: scale(0.97);
}

.type-icon {
  font-size: 28px;
}

.type-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Section */
.form-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-left: 4px;
  margin-bottom: 10px;
}

.section-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

/* Form Group */
.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.required {
  color: var(--apple-red);
}

.form-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.form-input::placeholder {
  color: var(--text-tertiary);
}

/* Difficulty Picker */
.difficulty-picker {
  display: flex;
  gap: 10px;
}

.difficulty-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  background: var(--bg-secondary);
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.difficulty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.difficulty-btn.beginner.active {
  background: rgba(52, 199, 89, 0.12);
  border-color: var(--apple-green);
  color: var(--apple-green);
}

.difficulty-btn.intermediate.active {
  background: rgba(255, 149, 0, 0.12);
  border-color: var(--apple-orange);
  color: var(--apple-orange);
}

.difficulty-btn.advanced.active {
  background: rgba(255, 59, 48, 0.12);
  border-color: var(--apple-red);
  color: var(--apple-red);
}

/* Tag List */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.tag-item {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border-radius: 20px;
  overflow: hidden;
}

.tag-input {
  padding: 8px 12px;
  font-size: 14px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  min-width: 100px;
}

.tag-input:focus {
  outline: none;
}

.tag-delete {
  padding: 8px 12px;
  font-size: 16px;
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.2s;
}

.tag-delete:hover {
  color: var(--apple-red);
}

.add-tag-btn {
  font-size: 14px;
  font-weight: 500;
  color: var(--apple-blue);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 0;
}

/* Step List */
.step-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: var(--apple-blue);
  color: white;
  border-radius: 50%;
  flex-shrink: 0;
}

.step-input {
  flex: 1;
  padding: 12px 14px;
  font-size: 15px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
}

.step-input:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.step-delete {
  padding: 8px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.2s;
}

.step-delete:hover {
  color: var(--apple-red);
}

.delete-icon {
  width: 18px;
  height: 18px;
}

/* List Items */
.list-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tip-icon,
.mistake-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.list-input {
  flex: 1;
  padding: 12px 14px;
  font-size: 15px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
}

.list-input:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.list-delete {
  padding: 8px 12px;
  font-size: 18px;
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.2s;
}

.list-delete:hover {
  color: var(--apple-red);
}

.add-item-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  border: 2px dashed var(--border-color);
  border-radius: 10px;
  color: var(--apple-blue);
  cursor: pointer;
  transition: all 0.2s;
}

.add-item-btn:hover {
  border-color: var(--apple-blue);
  background: rgba(0, 122, 255, 0.05);
}

.add-icon {
  width: 18px;
  height: 18px;
}

/* Form Textarea */
.form-textarea {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  resize: none;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--apple-blue);
}

/* Submit Section */
.submit-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-top: 0.5px solid var(--border-color);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  padding: 16px;
  font-size: 17px;
  font-weight: 600;
  background: var(--apple-blue);
  border: none;
  border-radius: 14px;
  color: white;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn:not(:disabled):active {
  transform: scale(0.98);
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Dark Mode */
:root.dark .section-card,
:root.dark .type-btn {
  background: var(--card-bg);
}

/* Responsive */
@media (min-width: 768px) {
  .form-content {
    max-width: 600px;
    margin: 0 auto;
  }
}
</style>
