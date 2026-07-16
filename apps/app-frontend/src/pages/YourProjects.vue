<script setup lang="ts">
import { OrganizationIcon, SpinnerIcon, UserIcon } from '@modrinth/assets'
import { Avatar, ButtonStyled, injectAuth, injectNotificationManager } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
	getUserProjects,
	type UserAllProjects,
	type UserOrganization,
	type UserProject,
} from '@/helpers/mr_auth.ts'

const { handleError } = injectNotificationManager()
const auth = injectAuth()
const router = useRouter()

const loading = ref(false)
const loadFailed = ref(false)
const data = ref<UserAllProjects | null>(null)

const authReady = computed(() => auth.isReady.value)
const signedIn = computed(() => !!auth.session_token.value)

type ProjectGroup = {
	key: string
	name: string
	slug: string | null
	icon_url: string | null
	personal: boolean
	projects: UserProject[]
}

const groups = computed<ProjectGroup[]>(() => {
	if (!data.value) return []

	const organizations = data.value.organizations ?? {}
	const personal: UserProject[] = []
	const byOrg = new Map<string, UserProject[]>()

	for (const project of data.value.projects ?? []) {
		if (project.organization && organizations[project.organization]) {
			const bucket = byOrg.get(project.organization) ?? []
			bucket.push(project)
			byOrg.set(project.organization, bucket)
		} else {
			personal.push(project)
		}
	}

	const orgGroups: ProjectGroup[] = [...byOrg.entries()]
		.map(([id, projects]) => {
			const org: UserOrganization | undefined = organizations[id]
			return {
				key: id,
				name: org?.name ?? 'Organization',
				slug: org?.slug ?? null,
				icon_url: org?.icon_url ?? null,
				personal: false,
				projects: sortProjects(projects),
			}
		})
		.sort((a, b) => a.name.localeCompare(b.name))

	const result: ProjectGroup[] = []
	if (personal.length > 0) {
		result.push({
			key: '__personal__',
			name: 'Personal',
			slug: null,
			icon_url: null,
			personal: true,
			projects: sortProjects(personal),
		})
	}
	result.push(...orgGroups)
	return result
})

const totalProjects = computed(() =>
	groups.value.reduce((total, group) => total + group.projects.length, 0),
)

function sortProjects(projects: UserProject[]): UserProject[] {
	return [...projects].sort((a, b) => a.name.localeCompare(b.name))
}

type StatusBadge = { label: string; class: string }

const PUBLIC_STATUSES = new Set(['approved', 'archived'])

function statusBadge(status: string): StatusBadge {
	switch (status) {
		case 'approved':
			return { label: 'Public', class: 'bg-highlight text-brand' }
		case 'archived':
			return { label: 'Archived', class: 'bg-button-bg text-secondary' }
		case 'unlisted':
			return { label: 'Unlisted', class: 'bg-highlight-orange text-orange' }
		case 'private':
			return { label: 'Private', class: 'bg-highlight-red text-red' }
		case 'draft':
			return { label: 'Draft', class: 'bg-button-bg text-secondary' }
		case 'processing':
			return { label: 'In review', class: 'bg-highlight-blue text-blue' }
		case 'scheduled':
			return { label: 'Scheduled', class: 'bg-highlight-blue text-blue' }
		case 'rejected':
			return { label: 'Rejected', class: 'bg-highlight-red text-red' }
		case 'withheld':
			return { label: 'Withheld', class: 'bg-highlight-red text-red' }
		default:
			return { label: 'Unknown', class: 'bg-button-bg text-secondary' }
	}
}

function isPublic(status: string): boolean {
	return PUBLIC_STATUSES.has(status)
}

function openProject(project: UserProject) {
	router.push(`/project/${project.slug ?? project.id}`)
}

async function load() {
	if (!signedIn.value) {
		data.value = null
		return
	}
	loading.value = true
	loadFailed.value = false
	try {
		data.value = await getUserProjects()
	} catch (err) {
		data.value = null
		loadFailed.value = true
		handleError(err)
	} finally {
		loading.value = false
	}
}

function signIn() {
	void auth.requestSignIn('/your-projects')
}

watch(
	() => auth.session_token.value,
	(token) => {
		if (token) {
			load()
		} else {
			// Signed out (or not yet signed in): drop any fetched project
			// metadata so private/unlisted projects don't linger on screen.
			data.value = null
			loadFailed.value = false
		}
	},
	{ immediate: true },
)
</script>

<template>
	<div class="p-6 flex flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="m-0 text-2xl font-extrabold text-contrast">Your projects</h1>
			<p class="m-0 text-secondary">
				Projects you own and projects from organizations you belong to, including unlisted and
				private ones only you and other members can see.
			</p>
		</div>

		<div v-if="!authReady || loading" class="flex items-center gap-2 text-secondary">
			<SpinnerIcon class="animate-spin" />
			<span>Loading your projects…</span>
		</div>

		<div
			v-else-if="!signedIn"
			class="flex flex-col items-center gap-3 rounded-xl bg-bg-raised p-8 text-center"
		>
			<p class="m-0 text-secondary">Sign in with your Modrinth account to see your projects.</p>
			<ButtonStyled color="brand">
				<button @click="signIn">Sign in</button>
			</ButtonStyled>
		</div>

		<div
			v-else-if="loadFailed"
			class="flex flex-col items-center gap-3 rounded-xl bg-bg-raised p-8 text-center"
		>
			<p class="m-0 text-secondary">Couldn't load your projects.</p>
			<ButtonStyled color="brand">
				<button @click="load">Try again</button>
			</ButtonStyled>
		</div>

		<div
			v-else-if="totalProjects === 0"
			class="flex flex-col items-center gap-2 rounded-xl bg-bg-raised p-8 text-center text-secondary"
		>
			<p class="m-0">You don't have access to any projects yet.</p>
		</div>

		<template v-else>
			<section v-for="group in groups" :key="group.key" class="flex flex-col gap-3">
				<div class="flex items-center gap-2">
					<Avatar v-if="group.icon_url" :src="group.icon_url" size="32px" />
					<UserIcon v-else-if="group.personal" class="size-6 text-secondary" />
					<OrganizationIcon v-else class="size-6 text-secondary" />
					<h2 class="m-0 text-lg font-bold text-contrast">{{ group.name }}</h2>
					<span class="text-sm text-secondary">{{ group.projects.length }}</span>
				</div>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
					<button
						v-for="project in group.projects"
						:key="project.id"
						class="flex flex-col gap-2 rounded-xl border-none bg-bg-raised p-4 text-left cursor-pointer transition-all hover:brightness-90"
						@click="openProject(project)"
					>
						<div class="flex items-center gap-3">
							<Avatar :src="project.icon_url" size="48px" />
							<div class="flex min-w-0 flex-col">
								<span class="truncate font-bold text-contrast">{{ project.name }}</span>
								<span class="text-xs text-secondary">
									{{ project.project_types.join(', ') || 'project' }}
								</span>
							</div>
						</div>
						<p class="m-0 line-clamp-2 text-sm text-secondary">{{ project.summary }}</p>
						<div class="mt-auto flex items-center gap-2">
							<span
								v-if="!isPublic(project.status)"
								class="rounded-full px-2 py-0.5 text-xs font-semibold"
								:class="statusBadge(project.status).class"
							>
								{{ statusBadge(project.status).label }}
							</span>
						</div>
					</button>
				</div>
			</section>
		</template>
	</div>
</template>
