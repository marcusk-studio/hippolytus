<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { ref as vueRef } from 'vue'
import { SearchIcon, XIcon, ClipboardCopyIcon, GlobeIcon, ExternalIcon } from '@modrinth/assets'
import type { Category, GameVersion, Platform, ProjectType, SortType, Tags } from '@modrinth/ui'
import {
  SearchFilterControl,
  SearchSidebarFilter,
  Button,
  Checkbox,
  DropdownSelect,
  LoadingIndicator,
  Pagination,
  useSearch,
} from '@modrinth/ui'
import { handleError } from '@/store/state'
import { useBreadcrumbs } from '@/store/breadcrumbs'
import { get_categories, get_game_versions, get_loaders } from '@/helpers/tags'
import type { LocationQuery } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import SearchCard from '@/components/ui/SearchCard.vue'
import { get as getInstance, get_projects as getInstanceProjects } from '@/helpers/profile.js'
import { get_search_results } from '@/helpers/cache.js'
import NavTabs from '@/components/ui/NavTabs.vue'
import type Instance from '@/components/ui/Instance.vue'
import InstanceIndicator from '@/components/ui/InstanceIndicator.vue'
import { defineMessages, useVIntl } from '@vintl/vintl'
import ContextMenu from '@/components/ui/ContextMenu.vue'
import { openUrl } from '@tauri-apps/plugin-opener'

const { formatMessage } = useVIntl()

const router = useRouter()
const route = useRoute()

const projectTypes = computed(() => {
  return [route.params.projectType as ProjectType]
})

const [categories, loaders, availableGameVersions] = await Promise.all([
  get_categories().catch(handleError).then(ref),
  get_loaders().catch(handleError).then(ref),
  get_game_versions().catch(handleError).then(ref),
])

const tags: Ref<Tags> = computed(() => ({
  gameVersions: availableGameVersions.value as GameVersion[],
  loaders: loaders.value as Platform[],
  categories: categories.value as Category[],
}))

type Instance = {
  game_version: string
  loader: string
  path: string
  install_stage: string
  icon_path?: string
  name: string
}

type InstanceProject = {
  metadata: {
    project_id: string
  }
}

const instance: Ref<Instance | null> = ref(null)
const instanceProjects: Ref<InstanceProject[] | null> = ref(null)
const instanceHideInstalled = ref(false)
const newlyInstalled = ref([])

const PERSISTENT_QUERY_PARAMS = ['i', 'ai']

await updateInstanceContext()

watch(route, () => {
  updateInstanceContext()
})

async function updateInstanceContext() {
  if (route.query.i) {
    ;[instance.value, instanceProjects.value] = await Promise.all([
      getInstance(route.query.i).catch(handleError),
      getInstanceProjects(route.query.i).catch(handleError),
    ])
    newlyInstalled.value = []
  }

  if (route.query.ai && !(projectTypes.value.length === 1 && projectTypes.value[0] === 'modpack')) {
    instanceHideInstalled.value = route.query.ai === 'true'
  }

  if (instance.value && instance.value.path !== route.query.i && route.path.startsWith('/browse')) {
    instance.value = null
    instanceHideInstalled.value = false
  }
}

type FeaturedProject = {
  id: string
  name: string
}

const featuredProjects = vueRef<FeaturedProject[]>([])

async function fetchFeaturedProjects() {
  try {
    const response = await fetch('https://cdn.marcusk.fun/featured.json')
    const data: { featured_projects: FeaturedProject[] } = await response.json()
    featuredProjects.value = data.featured_projects
    return true
  } catch (error) {
    handleError(error)
    featuredProjects.value = []
    return false
  }
}

const fetchSuccessful = ref(false)

fetchSuccessful.value = await fetchFeaturedProjects()

const instanceFilters = computed(() => {
  const filters: {
    type: string;
    option: string;
    negative?: boolean;
  }[] = []

  if (fetchSuccessful.value && featuredProjects.value.length > 0) {
    featuredProjects.value.forEach(project => {
      filters.push({
        type: 'project_id',
        option: `project_id:${project.id}`
      })
    })
  } else {
    filters.push({
      type: 'project_id',
      option: 'project_id:none'
    })
  }

  if (instance.value) {
    const gameVersion = instance.value.game_version
    if (gameVersion) {
      filters.push({
        type: 'game_version',
        option: gameVersion,
      })
    }

    const platform = instance.value.loader

    const supportedModLoaders = ['fabric', 'forge', 'quilt', 'neoforge']

    if (platform && projectTypes.value.includes('mod') && supportedModLoaders.includes(platform)) {
      filters.push({
        type: 'mod_loader',
        option: platform,
      })
    }

    if (instanceHideInstalled.value && instanceProjects.value) {
      const installedMods = Object.values(instanceProjects.value)
        .filter((x) => x.metadata)
        .map((x) => x.metadata.project_id)

      installedMods.push(...newlyInstalled.value)

      installedMods
        ?.map((x) => ({
          type: 'project_id',
          option: `project_id:${x}`,
          negative: true,
        }))
        .forEach((x) => filters.push(x))
    }
  }

  return filters
})

const {
  // Selections
  query,
  currentSortType,
  currentFilters,
  toggledGroups,
  maxResults,
  currentPage,
  overriddenProvidedFilterTypes,

  // Lists
  filters,
  sortTypes,

  // Computed
  requestParams,

  // Functions
  createPageParams,
} = useSearch(projectTypes, tags, instanceFilters)

query.value = ''

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
  offline.value = true
})
window.addEventListener('online', () => {
  offline.value = false
})

const breadcrumbs = useBreadcrumbs()
breadcrumbs.setContext({ name: 'Discover content', link: route.path, query: route.query })

const loading = ref(true)

const projectType = ref(route.params.projectType)

watch(projectType, () => {
  loading.value = true
})

type SearchResult = {
  project_id: string
}

type SearchResults = {
  total_hits: number
  limit: number
  hits: SearchResult[]
}

const results: Ref<SearchResults | null> = shallowRef(null)
const pageCount = computed(() =>
  results.value ? Math.ceil(results.value.total_hits / results.value.limit) : 1,
)

watch(requestParams, () => {
  if (!route.params.projectType) return
  refreshSearch()
})

async function refreshSearch() {
  let rawResults = await get_search_results(requestParams.value)
  if (!rawResults) {
    rawResults = {
      result: {
        hits: [],
        total_hits: 0,
        limit: 1,
      },
    }
  }

  if (instance.value) {
    for (const val of rawResults.result.hits) {
      val.installed =
        (newlyInstalled.value as string[]).includes(val.project_id) ||
        (instanceProjects.value ?? []).some(
          (x) => x.metadata && x.metadata.project_id === val.project_id,
        )
    }
  }
  results.value = rawResults.result

  const persistentParams: LocationQuery = {}

  for (const [key, value] of Object.entries(route.query)) {
    if (PERSISTENT_QUERY_PARAMS.includes(key)) {
      persistentParams[key] = value
    }
  }

  if (instanceHideInstalled.value) {
    persistentParams.ai = 'true'
  } else {
    delete persistentParams.ai
  }

  const params = {
    ...persistentParams,
    ...createPageParams(),
  }

  breadcrumbs.setContext({
    name: 'Discover content',
    link: `/browse/${projectType.value}`,
    query: params,
  })
  await router.replace({ path: route.path, query: params })
  loading.value = false
}

async function setPage(newPageNumber: number) {
  currentPage.value = newPageNumber
  await onSearchChangeToTop()
}

const searchWrapper: Ref<HTMLElement | null> = ref(null)

async function onSearchChangeToTop() {
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearSearch() {
  query.value = ''
}

watch(
  () => route.params.projectType,
  async (newType) => {
    if (!newType || newType === projectType.value) return
    projectType.value = newType
    currentSortType.value = { display: 'Relevance', name: 'relevance' }
    query.value = ''
  },
)

const selectableProjectTypes = computed(() => {
  let dataPacks = false,
    mods = false,
    modpacks = false

  if (instance.value) {
    if (
      (availableGameVersions.value as GameVersion[]).findIndex((x) => x.version === instance.value?.game_version) <=
      (availableGameVersions.value as GameVersion[]).findIndex((x) => x.version === '1.13')
    ) {
      dataPacks = true
    }

    if (instance.value.loader !== 'vanilla') {
      mods = true
    }
  } else {
    dataPacks = true
    mods = true
    modpacks = true
  }

  const params: LocationQuery = {}

  if (route.query.i) {
    params.i = route.query.i
  }
  if (route.query.ai) {
    params.ai = route.query.ai
  }

  const links = [
    { label: 'Modpacks', href: `/browse/modpack`, shown: modpacks },
    { label: 'Resource Packs', href: `/browse/resourcepack` },
  ]

  if (params) {
    return links.map((link) => {
      return {
        ...link,
        href: {
          path: link.href,
          query: params,
        },
      }
    })
  }

  return links
})

const messages = defineMessages({
  gameVersionProvidedByInstance: {
    id: 'search.filter.locked.instance-game-version.title',
    defaultMessage: 'Game version is provided by the instance',
  },
  modLoaderProvidedByInstance: {
    id: 'search.filter.locked.instance-loader.title',
    defaultMessage: 'Loader is provided by the instance',
  },
  providedByInstance: {
    id: 'search.filter.locked.instance',
    defaultMessage: 'Provided by the instance',
  },
  syncFilterButton: {
    id: 'search.filter.locked.instance.sync',
    defaultMessage: 'Sync with instance',
  },
})

const options = ref(null)
const handleRightClick = (event: MouseEvent, result: any) => {
  return
}

const handleOptionsClick = (args: { option: string; item: { project_type: string; slug: string } }) => {
  return
}

await refreshSearch()
</script>

<template>
  <div>
    <div class="content-wrapper">
      <div>
        <div ref="searchWrapper" class="flex flex-col gap-3 p-6">
          <template v-if="instance">
            <InstanceIndicator :instance="instance" />
            <h1 class="m-0 mb-1 text-xl">Install content to instance</h1>
          </template>
          <NavTabs :links="selectableProjectTypes" />
          <div class="flex gap-2">
            <Pagination :page="currentPage" :count="pageCount" class="ml-auto" @switch-page="setPage" />
          </div>
          <SearchFilterControl v-model:selected-filters="currentFilters"
            :filters="filters.filter((f) => f.display !== 'none')" :provided-filters="instanceFilters"
            :overridden-provided-filter-types="overriddenProvidedFilterTypes"
            :provided-message="messages.providedByInstance" />
          <div class="search">
            <section v-if="loading" class="offline">
              <LoadingIndicator />
            </section>
            <section v-else-if="offline && results?.total_hits === 0" class="offline">
              You are currently offline. Connect to the internet to browse Modrinth!
            </section>
            <section v-else class="project-list display-mode--list instance-results" role="list">
              <!-- @vue-ignore -->
              <SearchCard v-for="result in results?.hits" :key="result?.project_id" :project="result"
                :instance="instance ? instance : undefined" :categories="categories" />
            </section>
            <div class="flex justify-end">
              <pagination :page="currentPage" :count="pageCount" class="pagination-after" @switch-page="setPage" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.blur-background {
  backdrop-filter: blur(5px);
  height: 82vh;
}

.blur-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: -1;
}

.content-wrapper {
  position: relative;
  z-index: 1;
}
</style>
