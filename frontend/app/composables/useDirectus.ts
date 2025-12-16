import type { DirectusClient, RestClient, AuthenticationClient } from '@directus/sdk'
import type { DirectusSchema } from '~/types/directus'

type DirectusInstance = DirectusClient<DirectusSchema> & RestClient<DirectusSchema> & AuthenticationClient<DirectusSchema>

export const useDirectus = () => {
  const { $directus } = useNuxtApp()
  return $directus as DirectusInstance
}
