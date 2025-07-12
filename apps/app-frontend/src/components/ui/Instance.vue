<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  DownloadIcon,
  GameIcon,
  PlayIcon,
  SpinnerIcon,
  StopCircleIcon,
  TimerIcon,
  FolderOpenIcon,
  EyeIcon,
} from '@modrinth/assets'
import { Avatar, ButtonStyled } from '@modrinth/ui'
import { convertFileSrc } from '@tauri-apps/api/core'
import { finish_install, kill, run } from '@/helpers/profile'
import { get_by_profile_path } from '@/helpers/process'
import { process_listener } from '@/helpers/events'
import { handleError } from '@/store/state.js'
import { showProfileInFolder } from '@/helpers/utils.js'
import { handleSevereError } from '@/store/error.js'
import { trackEvent } from '@/helpers/analytics'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { formatCategory } from '@modrinth/utils'

dayjs.extend(relativeTime)

const props = defineProps({
  instance: {
    type: Object,
    default() {
      return {}
    },
  },
  compact: {
    type: Boolean,
    default: false,
  },
  first: {
    type: Boolean,
    default: false,
  },
})

const playing = ref(false)
const loading = ref(false)
const modLoading = computed(
  () =>
    loading.value ||
    currentEvent.value === 'installing' ||
    (currentEvent.value === 'launched' && !playing.value),
)
const installing = computed(() => props.instance.install_stage.includes('installing'))
const installed = computed(() => props.instance.install_stage === 'installed')

const router = useRouter()

const seeInstance = async () => {
  await router.push(`/instance/${encodeURIComponent(props.instance.path)}`)
}

const checkProcess = async () => {
  const runningProcesses = await get_by_profile_path(props.instance.path).catch(handleError)

  playing.value = runningProcesses.length > 0
}

const play = async (e, context) => {
  e?.stopPropagation()
  loading.value = true
  await run(props.instance.path)
    .catch((err) => handleSevereError(err, { profilePath: props.instance.path }))
    .finally(() => {
      trackEvent('InstancePlay', {
        loader: props.instance.loader,
        game_version: props.instance.game_version,
        source: context,
      })
    })
  loading.value = false
}

const stop = async (e, context) => {
  e?.stopPropagation()
  playing.value = false

  await kill(props.instance.path).catch(handleError)

  trackEvent('InstanceStop', {
    loader: props.instance.loader,
    game_version: props.instance.game_version,
    source: context,
  })
}

const repair = async (e) => {
  e?.stopPropagation()

  await finish_install(props.instance)
}

const openFolder = async () => {
  await showProfileInFolder(props.instance.path)
}

const addContent = async () => {
  await router.push({
    path: `/browse/${props.instance.loader === 'vanilla' ? 'datapack' : 'mod'}`,
    query: { i: props.instance.path },
  })
}

defineExpose({
  play,
  stop,
  seeInstance,
  openFolder,
  addContent,
  instance: props.instance,
})

const currentEvent = ref(null)

const unlisten = await process_listener((e) => {
  if (e.profile_path_id === props.instance.path) {
    currentEvent.value = e.event
    if (e.event === 'finished') {
      playing.value = false
    }
  }
})

onMounted(() => checkProcess())
onUnmounted(() => unlisten())
</script>

<template>
  <template v-if="compact">
    <div
      class="card-shadow grid grid-cols-[auto_1fr_auto] bg-bg-raised rounded-xl p-3 pl-4 gap-2 cursor-pointer hover:brightness-90 transition-all"
      @click="seeInstance"
      @mouseenter="checkProcess"
    >
      <Avatar
        size="48px"
        :src="instance.icon_path ? convertFileSrc(instance.icon_path) : null"
        :tint-by="instance.path"
        alt="Mod card"
      />
      <div class="h-full flex items-center font-bold text-contrast leading-normal">
        <span class="line-clamp-2">{{ instance.name }}</span>
      </div>
      <div class="flex items-center">
        <ButtonStyled v-if="playing" color="red" circular @mousehover="checkProcess">
          <button v-tooltip="'Stop'" @click="(e) => stop(e, 'InstanceCard')">
            <StopCircleIcon />
          </button>
        </ButtonStyled>
        <ButtonStyled v-else-if="modLoading" color="standard" circular>
          <button v-tooltip="'Instance is loading...'" disabled>
            <SpinnerIcon class="animate-spin" />
          </button>
        </ButtonStyled>
        <ButtonStyled v-else :color="first ? 'brand' : 'standard'" circular>
          <button
            v-tooltip="'Play'"
            @click="(e) => play(e, 'InstanceCard')"
            @mousehover="checkProcess"
          >
            <!-- Translate for optical centering -->
            <PlayIcon class="translate-x-[1px]" />
          </button>
        </ButtonStyled>
      </div>
      <div class="flex items-center col-span-3 gap-1 text-secondary font-semibold">
        <TimerIcon />
        <span class="text-sm"> Played {{ dayjs(instance.last_played).fromNow() }} </span>
      </div>
    </div>
  </template>
  <div v-else class="instance-card">
    <div
      class="card-content"
      @click="seeInstance"
      @mouseenter="checkProcess"
    >
      <div class="card-header">
        <div class="icon-container">
          <Avatar
            size="80px"
            :src="instance.icon_path ? convertFileSrc(instance.icon_path) : null"
            :tint-by="instance.path"
            alt="Instance icon"
            :class="`instance-icon ${modLoading || installing ? 'loading' : ''}`"
          />
          
          <div class="status-overlay">
            <ButtonStyled v-if="playing" size="large" color="red" circular>
              <button
                v-tooltip="'Stop'"
                class="status-button"
                @click="(e) => stop(e, 'InstanceCard')"
                @mousehover="checkProcess"
              >
                <StopCircleIcon />
              </button>
            </ButtonStyled>
            <SpinnerIcon
              v-else-if="modLoading || installing"
              v-tooltip="modLoading ? 'Instance is loading...' : 'Installing...'"
              class="status-spinner"
            />
            <ButtonStyled v-else-if="!installed" size="large" color="brand" circular>
              <button
                v-tooltip="'Repair'"
                class="status-button"
                @click="(e) => repair(e)"
              >
                <DownloadIcon />
              </button>
            </ButtonStyled>
            <ButtonStyled v-else size="large" color="brand" circular>
              <button
                v-tooltip="'Play'"
                class="status-button"
                @click="(e) => play(e, 'InstanceCard')"
                @mousehover="checkProcess"
              >
                <PlayIcon class="translate-x-[1px]" />
              </button>
            </ButtonStyled>
          </div>
        </div>
      </div>

      <div class="card-body">
        <h3 class="instance-name">{{ instance.name }}</h3>
        
        <div class="instance-details">
          <div class="detail-item">
            <GameIcon class="detail-icon" />
            <span class="detail-text">
              {{ formatCategory(instance.loader) }} {{ instance.game_version }}
            </span>
          </div>
          
          <div class="detail-item">
            <TimerIcon class="detail-icon" />
            <span class="detail-text">
              Played {{ dayjs(instance.last_played).fromNow() }}
            </span>
          </div>
        </div>
      </div>

      <div class="card-actions">
        <ButtonStyled color="standard" size="small" circular>
          <button v-tooltip="'View instance'" @click="seeInstance">
            <EyeIcon />
          </button>
        </ButtonStyled>
        <ButtonStyled color="standard" size="small" circular>
          <button v-tooltip="'Open folder'" @click="openFolder">
            <FolderOpenIcon />
          </button>
        </ButtonStyled>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.instance-card {
  background: #0a0101;
  border-radius: 1rem;
  border: none;
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  }
  
  .card-content {
    padding: 1.125rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
  }
  
  .card-header {
    display: flex;
    justify-content: center;
    
    .icon-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      
      .instance-icon {
        transition: all 0.3s ease;
        width: 64px !important;
        height: 64px !important;
        
        &.loading {
          opacity: 0.5;
          transform: scale(0.9);
        }
      }
      
      .status-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        
        .status-button {
          opacity: 0;
          transform: scale(0.8);
          transition: all 0.2s ease;
          
          &:hover {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .status-spinner {
          width: 1.5rem;
          height: 1.5rem;
          color: var(--color-brand);
          animation: spin 1s linear infinite;
        }
      }
    }
  }
  
  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    
    .instance-name {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-contrast);
      line-height: 1.3;
      text-align: center;
      word-break: break-word;
    }
    
    .instance-details {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      
      .detail-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.5rem;
        border: none;
        
        .detail-icon {
          width: 0.875rem;
          height: 0.875rem;
          color: var(--color-secondary);
          flex-shrink: 0;
        }
        
        .detail-text {
          font-size: 0.8125rem;
          color: var(--color-secondary);
          font-weight: 500;
          line-height: 1.2;
        }
      }
    }
  }
  
  .card-actions {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    padding-top: 0.375rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    
    button {
      padding: 0.375rem;
      border-radius: 0.5rem;
      transition: all 0.2s ease;
      
      &:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: scale(1.05);
      }
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// Responsive adjustments
@media (max-width: 768px) {
  .instance-card {
    .card-content {
      padding: 1rem;
      gap: 0.75rem;
    }
    
    .card-header .icon-container .instance-icon {
      width: 64px !important;
      height: 64px !important;
    }
    
    .card-body .instance-name {
      font-size: 1.125rem;
    }
    
    .card-actions {
      gap: 0.25rem;
      
      button {
        padding: 0.375rem;
      }
    }
  }
}

@media (max-width: 480px) {
  .instance-card {
    .card-content {
      padding: 0.875rem;
    }
    
    .card-body .instance-details .detail-item {
      padding: 0.375rem;
      
      .detail-text {
        font-size: 0.8125rem;
      }
    }
  }
}
</style>
