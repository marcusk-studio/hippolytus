<template>
  <div class="action-groups">
    <ButtonStyled v-if="currentLoadingBars.length > 0" color="brand" type="transparent" circular>
      <button ref="infoButton" @click="toggleCard()">
        <DownloadIcon />
      </button>
    </ButtonStyled>
    <div v-if="offline" class="status">
      <UnplugIcon />
      <div class="running-text">
        <span> Offline </span>
      </div>
    </div>
    <div 
      v-if="selectedProcess" 
      class="instance-status-indicator running-state flex h-8 overflow-hidden gap-3 justify-center items-center px-2 rounded-[9px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] bg-gradient-to-r from-[#FF6B35] via-[#F05B32] to-[#E59256] [box-shadow:_0_0_20px_rgba(249,115,22,0.9)] animate-pulse"
    >
      <span class="circle running w-4 h-4 rounded-full m-0 [box-shadow:_0_0_12px_rgba(34,197,94,0.9)] animate-pulse" />
      <div ref="profileButton" class="self-stretch my-auto flex items-center gap-1">
        <router-link 
          :to="`/instance/${encodeURIComponent(selectedProcess.profile.path)}`"
          class="text-sm leading-4 font-medium text-white"
        >
          {{ selectedProcess.profile.name }}
        </router-link>
        <div
          v-if="currentProcesses.length > 1"
          class="arrow button-base text-white"
          :class="{ rotate: showProfiles }"
          @click="toggleProfiles()"
        >
          <DropdownIcon />
        </div>
      </div>
      <Button
        v-tooltip="'Stop instance'"
        icon-only
        class="icon-button stop"
        @click="stop(selectedProcess)"
      >
        <StopCircleIcon />
      </Button>
      <Button 
        v-tooltip="'View logs'" 
        icon-only 
        class="icon-button text-white" 
        @click="goToTerminal()"
      >
        <TerminalSquareIcon />
      </Button>
    </div>
    <div 
      v-else 
      class="instance-status-indicator stopped-state flex h-8 overflow-hidden gap-3 justify-center items-center px-2 rounded-[9px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] bg-gradient-to-r from-gray-400 via-gray-500 to-gray-600"
      role="status"
      aria-live="polite"
    >
      <span class="circle stopped w-4 h-4 bg-gray-300 rounded-full m-0" />
      <div class="self-stretch my-auto flex items-center">
        <span class="text-sm leading-4 font-medium text-white">No instances running</span>
      </div>
    </div>
  </div>
  <transition name="download">
    <Card v-if="showCard === true && currentLoadingBars.length > 0" ref="card" class="info-card">
      <div v-for="loadingBar in currentLoadingBars" :key="loadingBar.id" class="info-text">
        <h3 class="info-title">
          {{ loadingBar.title }}
        </h3>
        <ProgressBar :progress="Math.floor((100 * loadingBar.current) / loadingBar.total)" />
        <div class="row">
          {{ Math.floor((100 * loadingBar.current) / loadingBar.total) }}% {{ loadingBar.message }}
        </div>
      </div>
    </Card>
  </transition>
  <transition name="download">
    <Card
      v-if="showProfiles === true && currentProcesses.length > 0"
      ref="profiles"
      class="profile-card"
    >
      <Button
        v-for="process in currentProcesses"
        :key="process.uuid"
        class="profile-button"
        @click="selectProcess(process)"
      >
        <div class="text"><span class="circle running" /> {{ process.profile.name }}</div>
        <Button
          v-tooltip="'Stop instance'"
          icon-only
          class="icon-button stop"
          @click.stop="stop(process)"
        >
          <StopCircleIcon />
        </Button>
        <Button
          v-tooltip="'View logs'"
          icon-only
          class="icon-button"
          @click.stop="goToTerminal(process.profile.path)"
        >
          <TerminalSquareIcon />
        </Button>
      </Button>
    </Card>
  </transition>
</template>

<script setup>
import {
  DownloadIcon,
  StopCircleIcon,
  TerminalSquareIcon,
  DropdownIcon,
  UnplugIcon,
} from '@modrinth/assets'
import { Button, ButtonStyled, Card } from '@modrinth/ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { get_all as getRunningProcesses, kill as killProcess } from '@/helpers/process'
import { loading_listener, process_listener } from '@/helpers/events'
import { useRouter } from 'vue-router'
import { progress_bars_list } from '@/helpers/state.js'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { handleError } from '@/store/notifications.js'
import { get_many } from '@/helpers/profile.js'
import { trackEvent } from '@/helpers/analytics'

const router = useRouter()
const card = ref(null)
const profiles = ref(null)
const infoButton = ref(null)
const profileButton = ref(null)
const showCard = ref(false)

const showProfiles = ref(false)

const currentProcesses = ref([])
const selectedProcess = ref()

const refresh = async () => {
  const processes = await getRunningProcesses().catch(handleError)
  const profiles = await get_many(processes.map((x) => x.profile_path)).catch(handleError)

  currentProcesses.value = processes.map((x) => ({
    profile: profiles.find((prof) => x.profile_path === prof.path),
    ...x,
  }))
  if (!selectedProcess.value || !currentProcesses.value.includes(selectedProcess.value)) {
    selectedProcess.value = currentProcesses.value[0]
  }
}

await refresh()

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
  offline.value = true
})
window.addEventListener('online', () => {
  offline.value = false
})

const unlistenProcess = await process_listener(async () => {
  await refresh()
})

const stop = async (process) => {
  try {
    await killProcess(process.uuid).catch(handleError)

    trackEvent('InstanceStop', {
      loader: process.profile.loader,
      game_version: process.profile.game_version,
      source: 'AppBar',
    })
  } catch (e) {
    console.error(e)
  }
  await refresh()
}

const goToTerminal = (path) => {
  router.push(`/instance/${encodeURIComponent(path ?? selectedProcess.value.profile.path)}/logs`)
}

const currentLoadingBars = ref([])

const refreshInfo = async () => {
  const currentLoadingBarCount = currentLoadingBars.value.length
  currentLoadingBars.value = Object.values(await progress_bars_list().catch(handleError)).map(
    (x) => {
      if (x.bar_type.type === 'java_download') {
        x.title = 'Downloading Java ' + x.bar_type.version
      }
      if (x.bar_type.profile_path) {
        x.title = x.bar_type.profile_path
      }
      if (x.bar_type.pack_name) {
        x.title = x.bar_type.pack_name
      }

      return x
    },
  )

  currentLoadingBars.value.sort((a, b) => {
    if (a.loading_bar_uuid < b.loading_bar_uuid) {
      return -1
    }
    if (a.loading_bar_uuid > b.loading_bar_uuid) {
      return 1
    }
    return 0
  })

  if (currentLoadingBars.value.length === 0) {
    showCard.value = false
  } else if (currentLoadingBarCount < currentLoadingBars.value.length) {
    showCard.value = true
  }
}

await refreshInfo()
const unlistenLoading = await loading_listener(async () => {
  await refreshInfo()
})

const selectProcess = (process) => {
  selectedProcess.value = process
  showProfiles.value = false
}

const handleClickOutsideCard = (event) => {
  const elements = document.elementsFromPoint(event.clientX, event.clientY)
  if (
    card.value &&
    card.value.$el !== event.target &&
    !elements.includes(card.value.$el) &&
    infoButton.value &&
    !infoButton.value.contains(event.target)
  ) {
    showCard.value = false
  }
}

const handleClickOutsideProfile = (event) => {
  const elements = document.elementsFromPoint(event.clientX, event.clientY)
  if (
    profiles.value &&
    profiles.value.$el !== event.target &&
    !elements.includes(profiles.value.$el) &&
    !profileButton.value.contains(event.target)
  ) {
    showProfiles.value = false
  }
}

const toggleCard = async () => {
  showCard.value = !showCard.value
  showProfiles.value = false
  await refreshInfo()
}

const toggleProfiles = async () => {
  if (currentProcesses.value.length === 1) return
  showProfiles.value = !showProfiles.value
  showCard.value = false
}

onMounted(() => {
  window.addEventListener('click', handleClickOutsideCard)
  window.addEventListener('click', handleClickOutsideProfile)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutsideCard)
  window.removeEventListener('click', handleClickOutsideProfile)
  unlistenProcess()
  unlistenLoading()
})
</script>

<style scoped lang="scss">
.action-groups {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--gap-md);
}

.instance-status-indicator {
  transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  transform-origin: center;
  
  &.running-state {
    animation: runningGlow 2s ease-in-out infinite alternate;
    
    &:hover {
      transform: scale(1.05);
      box-shadow: 0 0 25px rgba(249, 115, 22, 1);
    }
  }
  
  &.stopped-state {
    animation: stoppedGlow 3s ease-in-out infinite;
    
    &:hover {
      transform: scale(1.02);
    }
  }
}

@keyframes runningGlow {
  0% {
    box-shadow: 0 0 20px rgba(249, 115, 22, 0.7);
  }
  100% {
    box-shadow: 0 0 25px rgba(249, 115, 22, 0.8), 0 0 30px rgba(255, 107, 53, 0.4);
  }
}

@keyframes stoppedGlow {
  0%, 100% {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  }
  50% {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), 0 0 10px rgba(156, 163, 175, 0.2);
  }
}

.circle {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  display: inline-block;
  margin-right: 0.25rem;
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);

  &.running {
    background-color: #22C55E;
    animation: greenPulse 1.5s ease-in-out infinite alternate;
  }

  &.stopped {
    display: block;
    animation: grayPulse 2s ease-in-out infinite;
  }
}

@keyframes greenPulse {
  0% {
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.7);
    transform: scale(1);
  }
  100% {
    box-shadow: 0 0 15px rgba(34, 197, 94, 0.8), 0 0 20px rgba(34, 197, 94, 0.4);
    transform: scale(1.05);
  }
}

@keyframes grayPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.02);
    opacity: 1;
  }
}

.arrow {
  transition: transform 0.2s ease-in-out;
  display: flex;
  align-items: center;
  &.rotate {
    transform: rotate(180deg);
  }
}

.status {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-button-bg);
  padding: var(--gap-sm) var(--gap-lg);

  &:not(:has(.running)) {
    border: none;
    padding: 0;
  }
}

.running-text {
  display: flex;
  flex-direction: row;
  gap: var(--gap-xs);
  white-space: nowrap;
  overflow: hidden;
  -webkit-user-select: none; /* Safari */
  -ms-user-select: none; /* IE 10 and IE 11 */
  user-select: none;

  &.clickable:hover {
    cursor: pointer;
  }
}

.icon-button {
  background-color: transparent;
  box-shadow: none;
  width: 1.25rem !important;
  height: 1.25rem !important;
  padding: 0;
  transition: all 0.2s ease-in-out;

  svg {
    min-width: 1.25rem;
  }

  &.stop {
    color: var(--color-red);
    
    &:hover {
      transform: scale(1.1);
      color: #dc2626;
    }
  }
  
  &:hover {
    transform: scale(1.05);
  }
}

.info-card {
  position: absolute;
  top: 3.5rem;
  right: 0.5rem;
  z-index: 9;
  width: 20rem;
  background-color: var(--color-raised-bg);
  box-shadow: var(--shadow-raised);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: auto;
  transition: all 0.2s ease-in-out;
  border: 1px solid var(--color-button-bg);

  &.hidden {
    transform: translateY(-100%);
  }
}

.loading-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0;

  :hover {
    background-color: var(--color-raised-bg-hover);
  }
}

.loading-text {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;

  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
}

.loading-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: block;

  :deep(svg) {
    left: 1rem;
    width: 2.25rem;
    height: 2.25rem;
  }
}

.download-enter-active,
.download-leave-active {
  transition: opacity 0.3s ease;
}

.download-enter-from,
.download-leave-to {
  opacity: 0;
}

.progress-bar {
  width: 100%;
}

.info-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}

.info-title {
  margin: 0;
}

.profile-button {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--gap-sm);
  width: 100%;
  background-color: var(--color-raised-bg);
  box-shadow: none;
  transition: all 0.2s ease-in-out;

  .text {
    margin-right: auto;
  }
  
  &:hover {
    transform: translateX(2px);
    background-color: var(--color-raised-bg-hover);
  }
}

.profile-card {
  position: absolute;
  top: 3.5rem;
  right: 0.5rem;
  z-index: 9;
  background-color: var(--color-raised-bg);
  box-shadow: var(--shadow-raised);
  display: flex;
  flex-direction: column;
  overflow: auto;
  transition: all 0.2s ease-in-out;
  border: 1px solid var(--color-button-bg);
  padding: var(--gap-md);

  &.hidden {
    transform: translateY(-100%);
  }
}

.link {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--gap-sm);
  margin: 0;
  color: var(--color-text);
  text-decoration: none;
}
</style>
