<script setup>
import { DownloadIcon, PlayIcon } from '@modrinth/assets'
import { ButtonStyled, injectNotificationManager } from '@modrinth/ui'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { trackEvent } from '@/helpers/analytics'
import { get_project, get_search_results, get_version_many } from '@/helpers/cache.js'
import { instance_listener, process_listener } from '@/helpers/events'
import { list, run, update_managed_modrinth_version } from '@/helpers/instance'
import { injectContentInstall } from '@/providers/content-install'
import { useBreadcrumbs } from '@/store/breadcrumbs'

const { handleError } = injectNotificationManager()
const { install: installVersion } = injectContentInstall()

const featuredModpacks = ref([])
const featuredMods = ref([])
const filter = ref('')

const route = useRoute()
const breadcrumbs = useBreadcrumbs()

breadcrumbs.setRootContext({ name: 'Home', link: route.path })

const recentInstances = ref([])

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
	offline.value = true
})
window.addEventListener('online', () => {
	offline.value = false
})

const getInstances = async () => {
	const instances = (await list().catch(handleError)) ?? []

	recentInstances.value = instances
		.filter((x) => x.last_played)
		.sort((a, b) => {
			const dateA = dayjs(a.last_played)
			const dateB = dayjs(b.last_played)

			if (dateA.isSame(dateB)) {
				return a.name.localeCompare(b.name)
			}

			return dateB - dateA
		})

	filter.value = ''
}

const installing = ref({})
const installed = ref({})

const selectedModpackId = ref(localStorage.getItem('lastSelectedModpack') || '')
const selectedModpack = computed(() =>
	featuredModpacks.value.find((m) => m.project_id === selectedModpackId.value),
)

const featuredProjects = ref([])

const fetchFeaturedProjects = async () => {
	try {
		const response = await fetch('https://cdn.marcusk.fun/featured4.json')
		const data = await response.json()
		featuredProjects.value = data.featured_projects
		return true
	} catch (error) {
		handleError(error)
		featuredProjects.value = []
		return false
	}
}

const getFeaturedModpacks = async () => {
	await fetchFeaturedProjects()

	// Create structured filters exactly like in the browse file
	const filters = []

	// Project type filter
	filters.push(['project_type:modpack'])

	// Project ID filter - each project_id is its own entry in the inner array,
	// which the Modrinth search API treats as OR (there is no `OR` keyword)
	if (featuredProjects.value.length > 0) {
		filters.push(featuredProjects.value.map((p) => `project_id:${p.id}`))
	} else {
		filters.push(['project_id:none'])
	}

	// Build the facets parameter in the format the API expects
	const facetsParam = JSON.stringify(filters)

	// Construct the query with facets
	const query = `?facets=${facetsParam}&limit=10&index=follows${filter.value ? `&query=${filter.value}` : ''}`

	const response = await get_search_results(query)

	if (response?.result?.hits) {
		const instances = (await list().catch(handleError)) ?? []

		const latestVersions = await Promise.all(
			response.result.hits.map(async (hit) => {
				try {
					const project = await get_project(hit.project_id)

					if (!project?.versions?.length) {
						return null
					}

					const versions = await get_version_many(project.versions)
					return versions.sort((a, b) => new Date(b.date_published) - new Date(a.date_published))[0]
				} catch (error) {
					handleError(error)
					return null
				}
			}),
		)

		featuredModpacks.value = response.result.hits.map((hit, index) => {
			const instance = instances.find((p) => p.link?.project_id === hit.project_id)

			const isInstalled = !!instance
			installed.value[hit.project_id] = isInstalled

			if (isInstalled && latestVersions[index]) {
				const currentVersion = instance.link.version_id
				const latestVersion = latestVersions[index].id
				hasUpdate.value[hit.project_id] = currentVersion !== latestVersion
			}

			return {
				...hit,
				project_id: hit.project_id,
				project_type: hit.project_type,
				slug: hit.slug,
				latestVersionId: latestVersions[index]?.id,
			}
		})

		if (!selectedModpackId.value && featuredModpacks.value.length > 0) {
			selectedModpackId.value = featuredModpacks.value[0].project_id
		}
	} else {
		featuredModpacks.value = []
	}
}

watch(selectedModpackId, (newValue) => {
	if (newValue) {
		localStorage.setItem('lastSelectedModpack', newValue)
	}
})

const updating = ref({})
const hasUpdate = ref({})

const selectedModpackHasUpdate = computed(() => {
	return selectedModpack.value ? hasUpdate.value[selectedModpack.value.project_id] : false
})

const install = async (projectId) => {
	installing.value[projectId] = true
	try {
		await installVersion(projectId, null, null, 'HomePage', (version) => {
			installing.value[projectId] = false
			if (version) {
				installed.value[projectId] = true
				// Store the installed version ID for update checks
				hasUpdate.value[projectId] = false
			}
		})
	} catch (error) {
		installing.value[projectId] = false
		handleError(error)
	}
}

const updateModpack = async (projectId) => {
	if (!updating.value[projectId]) {
		updating.value[projectId] = true
		try {
			const instance = (await list()).find((p) => p.link?.project_id === projectId)
			const project = await get_project(projectId)

			if (project?.versions?.length) {
				const versions = await get_version_many(project.versions)
				const latestVersion = versions.sort(
					(a, b) => new Date(b.date_published) - new Date(a.date_published),
				)[0]

				if (instance?.id && latestVersion?.id && instance?.link?.version_id) {
					await update_managed_modrinth_version(instance.id, latestVersion.id)
					hasUpdate.value[projectId] = false
					await getInstances()
				}
			}
		} catch (error) {
			handleError(error)
		} finally {
			updating.value[projectId] = false
		}
	}
}

const playing = ref({})

const unlistenProcess = await process_listener((e) => {
	const instances = recentInstances.value
	const instance = instances.find((p) => p.id === e.instance_id)

	if (instance?.link?.project_id) {
		if (e.event === 'finished') {
			playing.value[instance.link.project_id] = false
		} else {
			playing.value[instance.link.project_id] = true
		}
	}
})

const play = async (projectId) => {
	const instances = (await list().catch(handleError)) ?? []
	const instance = instances.find((p) => p.link?.project_id === projectId)
	if (instance) {
		try {
			playing.value[projectId] = true
			await run(instance.id).catch(handleError)
			trackEvent('InstanceStart', {
				loader: instance.loader,
				game_version: instance.game_version,
				source: 'HomePage',
			})
		} catch (error) {
			playing.value[projectId] = false
			handleError(error)
		}
	}
}

const getFeaturedMods = async () => {
	const response = await get_search_results('?facets=[["project_type:mod"]]&limit=10&index=follows')

	if (response) {
		featuredMods.value = response.result.hits
	} else {
		featuredModpacks.value = []
	}
}

await getInstances()

await Promise.all([getFeaturedModpacks(), getFeaturedMods()])

const unlistenInstance = await instance_listener(async (e) => {
	await getInstances()

	if (e.event === 'added' || e.event === 'created' || e.event === 'removed') {
		await Promise.all([getFeaturedModpacks(), getFeaturedMods()])
	}
})

const isDropdownOpen = ref(false)
const dropdownRef = ref(null)

onMounted(() => {
	document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener('click', handleClickOutside)
	unlistenProcess()
	unlistenInstance()
})

const handleClickOutside = (event) => {
	if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
		isDropdownOpen.value = false
	}
}

const selectModpack = (projectId) => {
	selectedModpackId.value = projectId

	setTimeout(() => {
		isDropdownOpen.value = false
	}, 150)
}

const handleModpackSelection = (projectId) => {
	const selectedElement = document.querySelector(`[data-modpack-id="${projectId}"]`)
	if (selectedElement) {
		selectedElement.style.transform = 'scale(0.95)'
		setTimeout(() => {
			selectedElement.style.transform = 'scale(1)'
		}, 100)
	}

	selectModpack(projectId)
}
</script>

<template>
	<div class="p-6 flex flex-col h-full">
		<!-- Modpack selector section -->
		<div class="flex flex-col flex-grow">
			<div class="mt-auto flex justify-between items-center">
				<div class="flex items-center gap-4">
					<div ref="dropdownRef" class="relative">
						<button
							class="w-[435px] p-4 bg-raised rounded-lg flex items-center justify-between border border-[--brand-gradient-border] transition-all duration-200 ease-out hover:bg-[--color-button-bg] hover:shadow-lg active:scale-[0.98] relative overflow-hidden"
							@click="isDropdownOpen = !isDropdownOpen"
						>
							<div v-if="selectedModpack" class="flex items-center gap-4">
								<img
									v-if="selectedModpack.icon_url"
									:src="selectedModpack.icon_url"
									class="w-8 h-8 rounded transition-transform duration-200 hover:scale-110"
									:alt="selectedModpack.title"
								/>
								<span class="truncate max-w-[320px] transition-colors duration-200">{{
									selectedModpack.title
								}}</span>
							</div>
							<span v-else class="transition-colors duration-200">Select a modpack</span>
							<svg
								class="w-5 h-5 transition-all duration-200"
								:class="{ 'rotate-180': isDropdownOpen }"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
							>
								<polyline points="6 9 12 15 18 9"></polyline>
							</svg>
						</button>

						<!-- Dropdown content -->
						<Transition
							enter-active-class="transition-all duration-200 ease-out"
							enter-from-class="opacity-0 transform scale-95 translate-y-2"
							enter-to-class="opacity-100 transform scale-100 translate-y-0"
							leave-active-class="transition-all duration-150 ease-in"
							leave-from-class="opacity-100 transform scale-100 translate-y-0"
							leave-to-class="opacity-0 transform scale-95 translate-y-2"
						>
							<div
								v-if="isDropdownOpen"
								class="absolute z-50 w-full bottom-full mb-2 bg-raised rounded-lg border border-[--brand-gradient-border] shadow-lg max-h-[60vh] overflow-y-auto"
							>
								<div class="p-2">
									<TransitionGroup name="modpack-item" tag="div" appear>
										<div
											v-for="modpack in featuredModpacks"
											:key="modpack.project_id"
											:data-modpack-id="modpack.project_id"
											class="p-4 rounded-lg cursor-pointer hover:bg-[--color-button-bg] mb-2 last:mb-0 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-md"
											:class="{
												'bg-[--color-button-bg]': selectedModpackId === modpack.project_id,
											}"
											@click="handleModpackSelection(modpack.project_id)"
										>
											<div class="flex items-center gap-4">
												<img
													v-if="modpack.icon_url"
													:src="modpack.icon_url"
													class="w-12 h-12 rounded transition-transform duration-200"
													:alt="modpack.title"
												/>
												<div class="flex-grow overflow-hidden">
													<h3 class="text-lg font-bold m-0 truncate transition-colors duration-200">
														{{ modpack.title }}
													</h3>
													<p
														class="text-sm text-gray-500 m-0 truncate transition-colors duration-200"
													>
														{{ modpack.author }}
													</p>
												</div>
											</div>
										</div>
									</TransitionGroup>
								</div>
							</div>
						</Transition>
					</div>
				</div>

				<!-- Action buttons -->
				<Transition
					enter-active-class="transition-all duration-300 ease-out"
					enter-from-class="opacity-0 transform scale-95 translate-x-10"
					enter-to-class="opacity-100 transform scale-100 translate-x-0"
					leave-active-class="transition-all duration-200 ease-in"
					leave-from-class="opacity-100 transform scale-100 translate-x-0"
					leave-to-class="opacity-0 transform scale-95 translate-x-10"
				>
					<div v-if="selectedModpack" class="flex-shrink-0 !w-[300px]">
						<template v-if="installed[selectedModpack.project_id]">
							<div class="tactile-button tactile-button--orange">
								<ButtonStyled
									size="2xlarge"
									color="transparent"
									class="!h-[64px] !w-[300px] !min-w-[300px]"
								>
									<button
										:disabled="playing[selectedModpack.project_id]"
										class="flex flex-row items-center justify-center gap-3 !h-full !w-full text-xl font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
										@click="
											selectedModpackHasUpdate
												? updateModpack(selectedModpack.project_id)
												: play(selectedModpack.project_id)
										"
									>
										<div class="flex items-center justify-center w-8 h-8">
											<template v-if="updating[selectedModpack.project_id]">
												<span class="loader"></span>
											</template>
											<template v-else-if="selectedModpackHasUpdate">
												<DownloadIcon class="w-8 h-8" />
											</template>
											<template v-else>
												<PlayIcon class="w-8 h-8" />
											</template>
										</div>
										<div class="text-center min-h-[1.5rem] flex items-center justify-center">
											<template v-if="updating[selectedModpack.project_id]"> Updating... </template>
											<template v-else-if="selectedModpackHasUpdate"> Update </template>
											<template v-else>
												{{ playing[selectedModpack.project_id] ? 'Playing...' : 'Play' }}
											</template>
										</div>
									</button>
								</ButtonStyled>
							</div>
						</template>
						<template v-else>
							<div class="tactile-button">
								<ButtonStyled
									size="2xlarge"
									color="transparent"
									class="!h-[64px] !w-[300px] !min-w-[300px]"
								>
									<button
										v-tooltip="
											installed[selectedModpack.project_id]
												? `This project is already installed`
												: null
										"
										:disabled="installing[selectedModpack.project_id]"
										class="flex flex-row items-center justify-center gap-3 !h-full !w-full text-xl font-bold text-white"
										@click="install(selectedModpack.project_id)"
									>
										<div class="flex items-center justify-center w-8 h-8">
											<DownloadIcon
												v-if="!installing[selectedModpack.project_id]"
												class="w-8 h-8"
											/>
											<span v-else class="loader"></span>
										</div>
										<div class="text-center min-h-[1.5rem] flex items-center justify-center">
											{{ installing[selectedModpack.project_id] ? 'Installing...' : 'Install' }}
										</div>
									</button>
								</ButtonStyled>
							</div>
						</template>
					</div>
				</Transition>
			</div>
		</div>
	</div>
</template>

<style scoped>
.bg-raised {
	background-color: var(--color-raised-bg);
}

/* Add smooth transition for dropdown arrow */
svg {
	transition: transform 0.2s ease;
}

/* Add truncation styles */
.truncate {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.modpack-item-enter-active,
.modpack-item-leave-active {
	transition: all 0.3s ease;
}

.modpack-item-enter-from {
	opacity: 0;
	transform: translateX(-20px) scale(0.95);
}

.modpack-item-leave-to {
	opacity: 0;
	transform: translateX(20px) scale(0.95);
}

.modpack-item-move {
	transition: transform 0.3s ease;
}

button {
	transition: all 0.2s ease;
}

button:active {
	transform: scale(0.98);
}

.modpack-item-enter-active .p-4:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

img:hover {
	transform: scale(1.05);
}

.bg-\[--color-button-bg\] {
	animation: selectedPulse 0.3s ease-out;
}

@keyframes selectedPulse {
	0% {
		transform: scale(1);
		box-shadow: 0 0 0 0 rgba(var(--color-brand), 0.4);
	}
	50% {
		transform: scale(1.02);
		box-shadow: 0 0 0 8px rgba(var(--color-brand), 0.2);
	}
	100% {
		transform: scale(1);
		box-shadow: 0 0 0 0 rgba(var(--color-brand), 0);
	}
}

.loader {
	position: relative;
	width: 28px;
	height: 28px;
	background: linear-gradient(to right, #fff 20%, #0000 21%);
	background-repeat: repeat-x;
	background-size: 24px 6px;
	background-position: 6px bottom;
	animation: moveX 0.5s linear infinite;
}

.loader::before {
	content: '';
	position: absolute;
	width: 28px;
	height: 28px;
	border-radius: 2px;
	background-color: #fff;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	animation: rotate 0.5s linear infinite;
}

@keyframes moveX {
	0%,
	25% {
		background-position: 10px bottom;
	}

	75%,
	100% {
		background-position: -30px bottom;
	}
}

@keyframes rotate {
	0%,
	25% {
		transform: translate(-50%, -50%) rotate(0deg);
	}

	75%,
	100% {
		transform: translate(-55%, -55%) rotate(90deg);
	}
}
</style>
