<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  ArrowBigUpDashIcon,
  CompassIcon,
  DownloadIcon,
  HomeIcon,
  LeftArrowIcon,
  LibraryIcon,
  LogInIcon,
  LogOutIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlusIcon,
  RestoreIcon,
  RightArrowIcon,
  SettingsIcon,
  XIcon,
} from '@modrinth/assets'
import { Avatar, Button, ButtonStyled, Notifications, OverflowMenu } from '@modrinth/ui'
import { useLoading, useTheming } from '@/store/state'
import ModrinthAppLogo from '@/assets/modrinth_app.svg?component'
import AccountsCard from '@/components/ui/AccountsCard.vue'
import InstanceCreationModal from '@/components/ui/InstanceCreationModal.vue'
import { get } from '@/helpers/settings'
import Breadcrumbs from '@/components/ui/Breadcrumbs.vue'
import RunningAppBar from '@/components/ui/RunningAppBar.vue'
import SplashScreen from '@/components/ui/SplashScreen.vue'
import ErrorModal from '@/components/ui/ErrorModal.vue'
import ModrinthLoadingIndicator from '@/components/LoadingIndicatorBar.vue'
import { handleError, useNotifications } from '@/store/notifications.js'
import { command_listener, warning_listener } from '@/helpers/events.js'
import { type } from '@tauri-apps/plugin-os'
import { getOS, isDev, restartApp } from '@/helpers/utils.js'
import { debugAnalytics, initAnalytics, optOutAnalytics, trackEvent } from '@/helpers/analytics'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'
import URLConfirmModal from '@/components/ui/URLConfirmModal.vue'
import { create_profile_and_install_from_file } from './helpers/pack'
import { useError } from '@/store/error.js'
import { useCheckDisableMouseover } from '@/composables/macCssFix.js'
import ModInstallModal from '@/components/ui/install_flow/ModInstallModal.vue'
import IncompatibilityWarningModal from '@/components/ui/install_flow/IncompatibilityWarningModal.vue'
import InstallConfirmModal from '@/components/ui/install_flow/InstallConfirmModal.vue'
import { useInstall } from '@/store/install.js'
import { invoke } from '@tauri-apps/api/core'
import { get_opening_command, initialize_state } from '@/helpers/state'
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state'
import { renderString } from '@modrinth/utils'
import { useFetch } from '@/helpers/fetch.js'
import { check } from '@tauri-apps/plugin-updater'
import NavButton from '@/components/ui/NavButton.vue'
import { get as getCreds, login, logout } from '@/helpers/mr_auth.js'
import { get_user } from '@/helpers/cache.js'
import AppSettingsModal from '@/components/ui/modal/AppSettingsModal.vue'
import dayjs from 'dayjs'
import PromotionWrapper from '@/components/ui/PromotionWrapper.vue'
import { hide_ads_window, init_ads_window } from '@/helpers/ads.js'
import FriendsList from '@/components/ui/friends/FriendsList.vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import QuickInstanceSwitcher from '@/components/ui/QuickInstanceSwitcher.vue'

const themeStore = useTheming()

const news = ref([])

const urlModal = ref(null)

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
  offline.value = true
})
window.addEventListener('online', () => {
  offline.value = false
})

const showOnboarding = ref(false)
const nativeDecorations = ref(false)

const os = ref('')

const stateInitialized = ref(false)

const criticalErrorMessage = ref()

const isMaximized = ref(false)

// Import all background images
const backgrounds = import.meta.glob('@/assets/backgrounds/*')
const backgroundKeys = Object.keys(backgrounds)
const randomBackground = ref('')

onMounted(async () => {
  await useCheckDisableMouseover()

  document.querySelector('body').addEventListener('click', handleClick)
  document.querySelector('body').addEventListener('auxclick', handleAuxClick)

  // Choose a random background
  const randomKey = backgroundKeys[Math.floor(Math.random() * backgroundKeys.length)]
  const imageModule = await backgrounds[randomKey]()
  randomBackground.value = imageModule.default
})

onUnmounted(() => {
  document.querySelector('body').removeEventListener('click', handleClick)
  document.querySelector('body').removeEventListener('auxclick', handleAuxClick)
})

async function setupApp() {
  stateInitialized.value = true
  const {
    native_decorations,
    theme,
    telemetry,
    collapsed_navigation,
    advanced_rendering,
    onboarded,
    default_page,
    toggle_sidebar,
    developer_mode,
    feature_flags,
  } = await get()

  if (default_page === 'Library') {
    await router.push('/library')
  }

  os.value = await getOS()
  const dev = await isDev()
  const version = await getVersion()
  showOnboarding.value = !onboarded

  nativeDecorations.value = native_decorations
  if (os.value !== 'MacOS') await getCurrentWindow().setDecorations(native_decorations)

  themeStore.setThemeState(theme)
  themeStore.collapsedNavigation = collapsed_navigation
  themeStore.advancedRendering = advanced_rendering
  themeStore.toggleSidebar = toggle_sidebar
  themeStore.devMode = developer_mode
  themeStore.featureFlags = feature_flags

  isMaximized.value = await getCurrentWindow().isMaximized()

  await getCurrentWindow().onResized(async () => {
    isMaximized.value = await getCurrentWindow().isMaximized()
  })

  initAnalytics()
  if (!telemetry) {
    optOutAnalytics()
  }
  if (dev) debugAnalytics()
  trackEvent('Launched', { version, dev, onboarded })

  if (!dev) document.addEventListener('contextmenu', (event) => event.preventDefault())

  const osType = await type()
  if (osType === 'macos') {
    document.getElementsByTagName('html')[0].classList.add('mac')
  } else {
    document.getElementsByTagName('html')[0].classList.add('windows')
  }

  await warning_listener((e) =>
    notificationsWrapper.value.addNotification({
      title: 'Warning',
      text: e.message,
      type: 'warn',
    }),
  )

  useFetch(
    `https://cdn.marcusk.fun/appCriticalAnnouncement_${version}.json`,
    'criticalAnnouncements',
    true,
  ).then((res) => {
    if (res && res.header && res.body) {
      criticalErrorMessage.value = res
    }
  })

  useFetch(`https://modrinth.com/blog/news.json`, 'news', true).then((res) => {
    if (res && res.articles) {
      news.value = res.articles
    }
  })

  get_opening_command().then(handleCommand)
  checkUpdates()
  fetchCredentials()
}

const stateFailed = ref(false)
initialize_state()
  .then(() => {
    setupApp().catch((err) => {
      stateFailed.value = true
      console.error(err)
      error.showError(err, null, false, 'state_init')
    })
  })
  .catch((err) => {
    stateFailed.value = true
    console.error('Failed to initialize app', err)
    error.showError(err, null, false, 'state_init')
  })

const handleClose = async () => {
  await saveWindowState(StateFlags.ALL)
  await getCurrentWindow().close()
}

const router = useRouter()
router.afterEach((to, from, failure) => {
  trackEvent('PageView', { path: to.path, fromPath: from.path, failed: failure })
})
const route = useRoute()

const loading = useLoading()
loading.setEnabled(false)

const notifications = useNotifications()
const notificationsWrapper = ref()

const error = useError()
const errorModal = ref()

const install = useInstall()
const modInstallModal = ref()
const installConfirmModal = ref()
const incompatibilityWarningModal = ref()

const credentials = ref()

async function fetchCredentials() {
  const creds = await getCreds().catch(handleError)
  if (creds && creds.user_id) {
    creds.user = await get_user(creds.user_id).catch(handleError)
  }
  credentials.value = creds
}

async function signIn() {
  await login().catch(handleError)
  await fetchCredentials()
}

async function logOut() {
  await logout().catch(handleError)
  await fetchCredentials()
}

const MIDAS_BITFLAG = 1 << 0
const hasPlus = computed(
  () =>
    true,
)

const sidebarToggled = ref(true)

themeStore.$subscribe(() => {
  sidebarToggled.value = !themeStore.toggleSidebar
})

const forceSidebar = computed(
  () => route.path.startsWith('/browse') || route.path.startsWith('/project'),
)
const sidebarVisible = computed(() => sidebarToggled.value || forceSidebar.value)
const showAd = computed(() => !(!sidebarVisible.value || hasPlus.value))

watch(
  showAd,
  () => {
    if (!showAd.value) {
      hide_ads_window(true)
    } else {
      init_ads_window(true)
    }
  },
  { immediate: true },
)

onMounted(() => {
  invoke('show_window')

  notifications.setNotifs(notificationsWrapper.value)

  error.setErrorModal(errorModal.value)

  install.setIncompatibilityWarningModal(incompatibilityWarningModal)
  install.setInstallConfirmModal(installConfirmModal)
  install.setModInstallModal(modInstallModal)
})

const accounts = ref(null)

command_listener(handleCommand)
async function handleCommand(e) {
  if (!e) return

  if (e.event === 'RunMRPack') {
    // RunMRPack should directly install a local mrpack given a path
    if (e.path.endsWith('.mrpack')) {
      await create_profile_and_install_from_file(e.path).catch(handleError)
      trackEvent('InstanceCreate', {
        source: 'CreationModalFileDrop',
      })
    }
  } else {
    // Other commands are URL-based (deep linking)
    urlModal.value.show(e)
  }
}

const updateAvailable = ref(false)
async function checkUpdates() {
  const update = await check()
  updateAvailable.value = !!update

  setTimeout(
    () => {
      checkUpdates()
    },
    5 * 1000 * 60,
  )
}

function handleClick(e) {
  let target = e.target
  while (target != null) {
    if (target.matches('a')) {
      if (
        target.href &&
        ['http://', 'https://', 'mailto:', 'tel:'].some((v) => target.href.startsWith(v)) &&
        !target.classList.contains('router-link-active') &&
        !target.href.startsWith('http://localhost') &&
        !target.href.startsWith('https://tauri.localhost') &&
        !target.href.startsWith('http://tauri.localhost')
      ) {
        openUrl(target.href)
      }
      e.preventDefault()
      break
    }
    target = target.parentElement
  }
}

function handleAuxClick(e) {
  // disables middle click -> new tab
  if (e.button === 1) {
    e.preventDefault()
    // instead do a left click
    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    })
    e.target.dispatchEvent(event)
  }
}

function getTransitionKey(route) {
  return route.path;
}

function shouldApplyTransition(route) {
  const mainSection = route.path.split('/')[1] || 'home'
  
  if (mainSection === 'project' || mainSection === 'instance') {
    return false
  }
  
  return route.path === '/' || 
         route.path === '/browse' || 
         route.path.startsWith('/browse/') ||
         route.path === '/library'
}

function getTransitionType(route) {
  if (route.path === '/') {
    return 'main-page-transition' 
  } else if (route.path.startsWith('/browse')) {
    return 'discover-transition' 
  } else if (route.path === '/library') {
    return 'library-transition'
  } else {
    return 'main-page-transition' 
  }
}
</script>

<template>
  <SplashScreen v-if="!stateFailed" ref="splashScreen" data-tauri-drag-region />
  <div id="teleports"></div>
  <div v-if="stateInitialized" class="flex overflow-hidden flex-col px-8 py-7 bg-[#0B0101] h-screen">
    <Suspense>
      <AppSettingsModal ref="settingsModal" />
    </Suspense>
    <!-- Top Navigation Bar -->
    <div data-tauri-drag-region class="app-grid-statusbar bg-bg-raised h-[--top-bar-height] flex rounded-[25px]">
      <div data-tauri-drag-region class="flex p-3 w-full items-center relative">
        <div class="flex items-center gap-1">
          <button
            class="cursor-pointer p-0 m-0 border-none outline-none bg-button-bg rounded-full flex items-center justify-center w-6 h-6 hover:brightness-75 transition-all"
            @click="router.back()">
            <LeftArrowIcon />
          </button>
          <button
            class="cursor-pointer p-0 m-0 border-none outline-none bg-button-bg rounded-full flex items-center justify-center w-6 h-6 hover:brightness-75 transition-all"
            @click="router.forward()">
            <RightArrowIcon />
          </button>
        </div>
        <div class="w-[400px] overflow-hidden">
          <div class="truncate">
            <Breadcrumbs class="pt-[2px]" />
          </div>
        </div>
        <div class="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <ModrinthAppLogo class="h-16 w-auto text-contrast" />
        </div>
        <div class="flex-grow"></div>
        <div class="flex items-center gap-3">
          <ButtonStyled v-if="!forceSidebar && themeStore.toggleSidebar"
            :type="sidebarToggled ? 'standard' : 'transparent'" circular>
            <button class="mr-3 transition-transform" :class="{ 'rotate-180': !sidebarToggled }"
              @click="sidebarToggled = !sidebarToggled">
              <RightArrowIcon />
            </button>
          </ButtonStyled>
          <Suspense>
            <RunningAppBar />
          </Suspense>
          <section v-if="!nativeDecorations" class="window-controls">
            <Button class="titlebar-button" icon-only @click="() => getCurrentWindow().minimize()">
              <MinimizeIcon />
            </Button>
            <Button class="titlebar-button" icon-only @click="() => getCurrentWindow().toggleMaximize()">
              <RestoreIcon v-if="isMaximized" />
              <MaximizeIcon v-else />
            </Button>
            <Button class="titlebar-button close" icon-only @click="handleClose">
              <XIcon />
            </Button>
          </section>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex gap-5 mt-6" :style="{
    height: '90%',
  }">

      <!-- Left Sidebar -->
      <div class="app-grid-navbar bg-bg-raised flex flex-col p-4 w-[--left-bar-width] rounded-[25px] h-full">
        <div class="flex flex-col h-full">
          <div class="w-full">
            <suspense>
              <AccountsCard mode="normal" class="mb-4" />
            </suspense>

          </div>

          <!-- Main Navigation -->
          <nav class="flex flex-col justify-center items-start px-5 py-2.5 rounded-3xl bg-zinc-800 bg-opacity-50"
            role="navigation" aria-label="Main navigation">
            <div class="flex flex-col items-start w-full gap-2">
              <NavButton v-tooltip.right="'Home'" to="/"
                class="flex gap-4 justify-center items-center px-2 py-1.5 rounded-xl min-h-[45px] w-full hover:bg-zinc-700 focus:outline-none"
                tabindex="0" aria-label="Navigate to home page">
                <HomeIcon class="object-contain shrink-0 self-stretch my-auto w-6 aspect-square" />
                <span class="self-stretch my-auto">Home</span>
              </NavButton>

              <NavButton v-tooltip.right="'Discover content'" to="/browse/modpack"
                :is-primary="() => route.path.startsWith('/browse') && !route.query.i"
                :is-subpage="(route) => route.path.startsWith('/project') && !route.query.i"
                class="flex gap-4 justify-center items-center px-2 py-1.5 rounded-xl min-h-[45px] w-full hover:bg-zinc-700 focus:outline-none"
                tabindex="0" aria-label="Navigate to discover page">
                <CompassIcon class="object-contain shrink-0 self-stretch my-auto w-6 aspect-square" />
                <span class="self-stretch my-auto">Discover</span>
              </NavButton>

              <NavButton v-tooltip.right="'Library'" to="/library" :is-subpage="() =>
    route.path.startsWith('/instance') ||
    ((route.path.startsWith('/browse') || route.path.startsWith('/project')) &&
      route.query.i)
    " class="flex gap-4 justify-center items-center px-2 py-1.5 rounded-xl min-h-[45px] w-full hover:bg-zinc-700 focus:outline-none"
                tabindex="0" aria-label="Access your library">
                <LibraryIcon class="object-contain shrink-0 self-stretch my-auto w-6 aspect-square" />
                <span class="self-stretch my-auto">Library</span>
              </NavButton>
            </div>
          </nav>
        </div>
        <div class="flex flex-grow"></div>
        <nav class="flex flex-col justify-center items-start px-5 py-2.5 rounded-3xl bg-zinc-800 bg-opacity-50">
          <NavButton
            class="flex gap-4 justify-center items-center px-2 py-1.5 rounded-xl min-h-[45px] w-full hover:bg-zinc-700 focus:outline-none"
            v-tooltip.right="'Settings'" :to="() => $refs.settingsModal.show()">
            <SettingsIcon />
            <span class="self-stretch my-auto">Settings</span>
          </NavButton>
        </nav>
      </div>
      <!-- Main Content -->
      <div class="flex-grow rounded-[25px] overflow-hidden mt-4 mb-4" :style="{
    backgroundImage: randomBackground ? `url(${randomBackground})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    position: 'relative',
  }">
        <div v-if="route.path !== '/'" class="backdrop-blur-md absolute inset-0 z-0"></div>
        <div class="relative z-10 h-full overflow-auto">
          <RouterView v-slot="{ Component, route }">
            <template v-if="Component">
              <Suspense @pending="loading.startLoading()" @resolve="loading.stopLoading()">
                <template v-if="shouldApplyTransition(route)">
                  <div class="transition-container">
                    <Transition
                      :name="getTransitionType(route)"
                      mode="out-in"
                      appear
                    >
                      <component :is="Component" :key="getTransitionKey(route)"></component>
                    </Transition>
                  </div>
                </template>
                <template v-else>
                  <component :is="Component" :key="getTransitionKey(route)"></component>
                </template>
              </Suspense>
            </template>
          </RouterView>
        </div>
      </div>

    </div>
  </div>
  <URLConfirmModal ref="urlModal" />
  <Notifications ref="notificationsWrapper" sidebar />
  <ErrorModal ref="errorModal" />
  <ModInstallModal ref="modInstallModal" />
  <IncompatibilityWarningModal ref="incompatibilityWarningModal" />
  <InstallConfirmModal ref="installConfirmModal" />
</template>

<style lang="scss" scoped>
.window-controls {
  z-index: 20;
  display: none;
  flex-direction: row;
  align-items: center;

  .titlebar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all ease-in-out 0.1s;
    background-color: transparent;
    color: var(--color-base);
    height: 100%;
    width: 3rem;
    position: relative;
    box-shadow: none;

    &:last-child {
      padding-right: 0.75rem;
      width: 3.75rem;
    }

    svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    &::before {
      content: '';
      border-radius: 999999px;
      width: 3rem;
      height: 3rem;
      aspect-ratio: 1 / 1;
      margin-block: auto;
      position: absolute;
      background-color: transparent;
      scale: 0.9;
      transition: all ease-in-out 0.2s;
      z-index: -1;
    }

    &.close {

      &:hover,
      &:active {
        color: var(--color-accent-contrast);

        &::before {
          background-color: var(--color-red);
        }
      }
    }

    &:hover,
    &:active {
      color: var(--color-contrast);

      &::before {
        background-color: var(--color-button-bg);
        scale: 1;
      }
    }
  }
}

.app-grid-layout,
.app-contents {
  --top-bar-height: 65px;
  --left-bar-width: 300px;
  --right-bar-width: 300px;
}

.app-grid-layout {
  display: grid;
  grid-template: 'status status' 'nav dummy';
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  position: relative;
  //z-index: 0;
  background-color: var(--color-raised-bg);
  height: 100vh;
}

.app-grid-navbar {
  grid-area: nav;
}

.app-grid-statusbar {
  grid-area: status;
}

.app-contents {
  position: absolute;
  z-index: 1;
  left: var(--left-bar-width);
  top: var(--top-bar-height);
  right: 0;
  bottom: 0;
  height: calc(100vh - var(--top-bar-height));
  border-top-left-radius: var(--radius-xl);

  display: grid;
  grid-template-columns: 1fr 0px;
  // transition: grid-template-columns 0.4s ease-in-out;

  &.sidebar-enabled {
    grid-template-columns: 1fr 300px;
  }
}

.loading-indicator-container {
  border-top-left-radius: var(--radius-xl);
  overflow: hidden;
}

.app-sidebar {
  overflow: visible;
  width: 300px;
  position: relative;
  height: calc(100vh - var(--top-bar-height));
  background: var(--brand-gradient-bg);

  --color-button-bg: var(--brand-gradient-button);
  --color-button-bg-hover: var(--brand-gradient-border);
  --color-divider: var(--brand-gradient-border);
  --color-divider-dark: var(--brand-gradient-border);
}

.app-sidebar::after {
  content: '';
  position: absolute;
  bottom: 250px;
  left: 0;
  right: 0;
  height: 5rem;
  background: var(--brand-gradient-fade-out-color);
  pointer-events: none;
}

.app-sidebar.has-plus::after {
  display: none;
}

.app-sidebar::before {
  content: '';
  box-shadow: -15px 0 15px -15px rgba(0, 0, 0, 0.2) inset;
  top: 0;
  bottom: 0;
  left: -2rem;
  width: 2rem;
  position: absolute;
  pointer-events: none;
}

.app-viewport {
  flex-grow: 1;
  height: 100%;
  overflow: auto;
  overflow-x: hidden;
}

.app-contents::before {
  z-index: 1;
  content: '';
  position: fixed;
  left: var(--left-bar-width);
  top: var(--top-bar-height);
  right: calc(-1 * var(--left-bar-width));
  bottom: calc(-1 * var(--left-bar-width));
  border-radius: var(--radius-xl);
  box-shadow:
    1px 1px 15px rgba(0, 0, 0, 0.2) inset,
    inset 1px 1px 1px rgba(255, 255, 255, 0.23);
  pointer-events: none;
}

.sidebar-teleport-content {
  display: contents;
}

.sidebar-default-content {
  display: none;
}

.sidebar-teleport-content:empty+.sidebar-default-content.sidebar-enabled {
  display: contents;
}

/* Page Transition Styles */
/* Main page transitions - bigger effects for Home, Browse, Library */
.main-page-transition-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.main-page-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.main-page-transition-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
  filter: blur(2px);
}

.main-page-transition-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.98);
  filter: blur(2px);
}

.main-page-transition-enter-to,
.main-page-transition-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
}

.discover-transition-enter-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.discover-transition-leave-active {
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.discover-transition-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.discover-transition-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.discover-transition-enter-to,
.discover-transition-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.library-transition-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.library-transition-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.library-transition-enter-from {
  opacity: 0;
  transform: translateY(15px) scale(0.98);
}

.library-transition-leave-to {
  opacity: 0;
  transform: translateY(-15px) scale(0.98);
}

.library-transition-enter-to,
.library-transition-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.page-transition-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-transition-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
  filter: blur(2px);
}

.page-transition-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.98);
  filter: blur(2px);
}

.page-transition-enter-to,
.page-transition-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
}

.transition-container {
  overflow: hidden;
  height: 100%;
  width: 100%;
}
</style>
<style>
.mac {
  .app-grid-statusbar {
    padding-left: 0.5rem;
    padding-top: 0.5rem;
  }
}

.windows {
  .fake-appbar {
    height: 2.5rem !important;
  }

  .window-controls {
    display: flex !important;
  }

  .info-card {
    right: 8rem;
  }

  .profile-card {
    right: 8rem;
  }
}
</style>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
