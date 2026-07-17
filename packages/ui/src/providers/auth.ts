import type { Labrinth } from '@modrinth/api-client'
import type { Ref } from 'vue'

import { createContext } from './create-context'

export type AuthUser = Labrinth.Users.v2.User | Labrinth.Users.v3.User

export interface AuthProvider {
	session_token: Ref<string | null>
	user: Ref<AuthUser | null>
	/** True once the initial auth check has completed (regardless of result). */
	isReady?: Ref<boolean>
	requestSignIn: (redirectPath: string) => void | Promise<void>
	/**
	 * Re-reads the stored credentials and updates this provider. Use when a
	 * request reveals the session is no longer valid, so the rest of the app
	 * doesn't keep showing the user as signed in.
	 */
	refreshSession?: () => Promise<void>
}

export const [injectAuth, provideAuth] = createContext<AuthProvider>('root', 'auth')
