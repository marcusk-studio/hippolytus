/**
 * All theseus API calls return serialized values (both return values and errors);
 * So, for example, addDefaultInstance creates a blank instance object, where the Rust struct is serialized,
 *  and deserialized into a usable JS object.
 */
import { invoke } from '@tauri-apps/api/core'

export type ModrinthCredentials = {
	session: string
	expires: string
	user_id: string
	active: boolean
}

export async function login(): Promise<ModrinthCredentials> {
	return await invoke('plugin:mr-auth|modrinth_login')
}

export async function logout(): Promise<void> {
	return await invoke('plugin:mr-auth|logout')
}

export async function get(): Promise<ModrinthCredentials | null> {
	return await invoke('plugin:mr-auth|get')
}

export type UserProject = {
	id: string
	slug: string | null
	name: string
	summary: string
	description: string
	icon_url: string | null
	color: number | null
	status: string
	project_types: string[]
	organization: string | null
	downloads: number
	followers: number
}

export type UserOrganization = {
	id: string
	slug: string
	name: string
	description: string
	icon_url: string | null
	color: number | null
}

export type UserAllProjects = {
	projects: UserProject[]
	organizations: Record<string, UserOrganization>
}

/**
 * Returns every project the signed-in user can access — their own projects plus
 * every project owned by an organization they belong to — including non-public
 * statuses (unlisted, private). Resolves to `null` when no user is signed in.
 */
export async function getUserProjects(): Promise<UserAllProjects | null> {
	return await invoke('plugin:mr-auth|get_user_projects')
}

export async function cancelLogin(): Promise<void> {
	return await invoke('plugin:mr-auth|cancel_modrinth_login')
}
