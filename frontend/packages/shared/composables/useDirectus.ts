import type { DirectusClient, RestClient, AuthenticationClient } from '@directus/sdk'
import type { DirectusSchema } from '../types/directus'

export type DirectusInstance = DirectusClient<DirectusSchema> & RestClient<DirectusSchema> & AuthenticationClient<DirectusSchema>

/**
 * 取得 Directus 實例
 * 需要在 Nuxt 應用中透過 plugin 注入 $directus
 */
export const useDirectus = () => {
  const { $directus } = useNuxtApp()
  return $directus as DirectusInstance
}
