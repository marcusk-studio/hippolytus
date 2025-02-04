<script setup>
import { ref, onUnmounted, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { list, run } from '@/helpers/profile.js'
import { trackEvent } from '@/helpers/analytics'
import { profile_listener } from '@/helpers/events'
import { useBreadcrumbs } from '@/store/breadcrumbs'
import { handleError } from '@/store/notifications.js'
import dayjs from 'dayjs'
import { get_search_results } from '@/helpers/cache.js'
import { install as installVersion } from '@/store/install.js'
import { ButtonStyled } from '@modrinth/ui'
import {
  DownloadIcon,
  PlayIcon,
} from '@modrinth/assets'
import { openUrl } from '@tauri-apps/plugin-opener'

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
  const profiles = await list().catch(handleError)

  recentInstances.value = profiles
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
  featuredModpacks.value.find(m => m.project_id === selectedModpackId.value)
)

const featuredProjects = ref([])

const fetchFeaturedProjects = async () => {
  try {
    const response = await fetch('https://cdn.marcusk.fun/featured.json')
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

  const projectIdFacet = featuredProjects.value.length > 0
    ? `["project_id:${featuredProjects.value.map(p => p.id).join('"] OR ["project_id:')}"]`
    : '["project_id:none"]'

  const response = await get_search_results(
    `?facets=[["project_type:modpack"],${projectIdFacet}]&limit=10&index=follows${filter.value ? `&filters=${filter.value}` : ''}`,
  )

  if (response?.result?.hits) {
    const profiles = await list().catch(handleError)

    featuredModpacks.value = response.result.hits.map(hit => {
      const isInstalled = profiles.some(
        profile => profile.linked_data?.project_id === hit.project_id
      )
      installed.value[hit.project_id] = isInstalled

      return {
        ...hit,
        project_id: hit.project_id,
        project_type: hit.project_type,
        slug: hit.slug
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

const install = async (projectId) => {
  installing.value[projectId] = true
  try {
    await installVersion(projectId, null, null, 'HomePage', (version) => {
      installing.value[projectId] = false
      if (version) {
        installed.value[projectId] = true
      }
    })
  } catch (error) {
    installing.value[projectId] = false
    handleError(error)
  }
}

const play = async (projectId) => {
  const profiles = await list().catch(handleError)
  const profile = profiles.find(p => p.linked_data?.project_id === projectId)
  if (profile) {
    try {
      await run(profile.path).catch(handleError)
      trackEvent('InstancePlay', {
        source: 'HomePage'
      })
    } catch (error) {
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

const unlistenProfile = await profile_listener(async (e) => {
  await getInstances()

  if (e.event === 'added' || e.event === 'created' || e.event === 'removed') {
    await Promise.all([getFeaturedModpacks(), getFeaturedMods()])
  }
})

const total = computed(() => {
  return (
    (recentInstances.value?.length ?? 0) +
    (featuredModpacks.value?.length ?? 0) +
    (featuredMods.value?.length ?? 0)
  )
})

onUnmounted(() => {
  unlistenProfile()
})

const handleOptionsClick = (args) => {
  switch (args.option) {
    case 'play':
      play(selectedModpack.value.project_id)
      break
    case 'open-in-browser':
      openUrl(`https://modrinth.com/${selectedModpack.value.project_type}/${selectedModpack.value.slug}`)
      break
  }
}

const isDropdownOpen = ref(false)
const dropdownRef = ref(null)

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  unlistenProfile()
})

const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false
  }
}

</script>

<template>
  <div class="p-6 flex flex-col h-full">

    <!-- Modpack selector section -->
    <div class="flex flex-col flex-grow">
      <div class="mt-auto flex justify-center items-center gap-64">
        <div class="flex items-center gap-4">
          <div class="relative" ref="dropdownRef">
            <button @click="isDropdownOpen = !isDropdownOpen"
              class="w-96 p-4 bg-raised rounded-lg flex items-center justify-between border border-[--brand-gradient-border]">
              <div class="flex items-center gap-4" v-if="selectedModpack">
                <img v-if="selectedModpack.icon_url" :src="selectedModpack.icon_url" class="w-8 h-8 rounded"
                  :alt="selectedModpack.title" />
                <span>{{ selectedModpack.title }}</span>
              </div>
              <span v-else>Select a modpack</span>
              <svg class="w-5 h-5" :class="{ 'rotate-180': isDropdownOpen }" viewBox="0 0 24 24" fill="none"
                stroke="currentColor">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- Dropdown content -->
            <div v-if="isDropdownOpen"
              class="absolute z-50 w-full bottom-full mb-2 bg-raised rounded-lg border border-[--brand-gradient-border] shadow-lg max-h-[60vh] overflow-y-auto">
              <div class="p-2">
                <div v-for="modpack in featuredModpacks" :key="modpack.project_id"
                  class="p-4 rounded-lg cursor-pointer hover:bg-[--color-button-bg]"
                  :class="{ 'bg-[--color-button-bg]': selectedModpackId === modpack.project_id }"
                  @click="selectedModpackId = modpack.project_id; isDropdownOpen = false">
                  <div class="flex items-center gap-4">
                    <img v-if="modpack.icon_url" :src="modpack.icon_url" class="w-12 h-12 rounded"
                      :alt="modpack.title" />
                    <div class="flex-grow">
                      <h3 class="text-lg font-bold m-0">{{ modpack.title }}</h3>
                      <p class="text-sm text-gray-500 m-0">{{ modpack.author }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div v-if="selectedModpack" class="flex-shrink-0 !w-[300px]">
          <template v-if="installed[selectedModpack.project_id]">
            <div class="glassmorphism-play">
              <ButtonStyled size="2xlarge" color="transparent" class="!h-[300px] !w-[300px] !min-w-[300px]">
                <button @click="play(selectedModpack.project_id)"
                  class="flex items-center justify-center gap-3 !h-full !w-full text-3xl font-bold text-white">
                  <PlayIcon class="w-16 h-16" />
                  Play
                </button>
              </ButtonStyled>
            </div>
          </template>
          <template v-else>
            <div class="glassmorphism-play">
              <ButtonStyled size="2xlarge" color="transparent" class="!h-[300px] !w-[300px] !min-w-[300px]">
                <button v-tooltip="installed[selectedModpack.project_id] ? `This project is already installed` : null"
                  :disabled="installing[selectedModpack.project_id]" @click="install(selectedModpack.project_id)"
                  class="flex items-center justify-center gap-3 !h-full !w-full text-3xl font-bold text-white">
                  <DownloadIcon v-if="!installing[selectedModpack.project_id]" class="w-16 h-16" />
                  <div class="w-16 h-16 flex items-center justify-center" v-else>
                    <span class="loader"></span>
                  </div>
                  {{ installing[selectedModpack.project_id] ? 'Installing...' : 'Install' }}
                </button>
              </ButtonStyled>
            </div>
          </template>
        </div>
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

.glassmorphism-play {
  position: relative;
  border-radius: 12px;
  background: linear-gradient(135deg, #f05b32 0%, #e69154 100%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 0 40px rgba(234, 88, 12, 0.4),
    inset 0 0 20px rgba(234, 88, 12, 0.2);
}

.glassmorphism-play button,
.glassmorphism-play :deep(button) {
  background: transparent !important;
  color: white !important;
}

.glassmorphism-play svg {
  stroke: white !important;
}

.glassmorphism-play:hover svg {
  stroke: rgba(255, 255, 255, 0.7) !important;
}

.glassmorphism-play:hover {
  background: linear-gradient(135deg, #f05b32 0%, #e69154 100%);
  box-shadow: 0 0 60px rgba(234, 88, 12, 0.6),
    inset 0 0 30px rgba(234, 88, 12, 0.3);
}

.glassmorphism-play :deep(button):hover {
  color: rgba(255, 255, 255, 0.7) !important;
}

.loader {
  position: relative;
  width: 42px;
  height: 42px;
  background: linear-gradient(to right, #FFF 20%, #0000 21%);
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
    background-position: 10px bottom
  }

  75%,
  100% {
    background-position: -30px bottom;
  }
}

@keyframes rotate {

  0%,
  25% {
    transform: translate(-50%, -50%) rotate(0deg)
  }

  75%,
  100% {
    transform: translate(-55%, -55%) rotate(90deg)
  }
}
</style>
