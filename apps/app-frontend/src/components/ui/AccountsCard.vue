<template>
  <div class="relative" style="width: 250px">
    <div
      v-if="mode !== 'isolated'"
      ref="button"
      class="flex overflow-hidden gap-3 px-4 py-3 bg-white rounded-3xl border-2 border-gray-700 border-solid shadow-2xl items-center justify-center w-full cursor-pointer"
      role="article"
      @click="toggleMenu"
    >
      <Avatar
        size="64px"
        class="rounded-2xl object-contain shrink-0"
        :src="
          selectedAccount
            ? `https://minecraftpfp.com/api/pfp/${selectedAccount.username}.png`
            : 'https://launcher-files.modrinth.com/assets/steve_head.png'
        "
        :alt="selectedAccount ? selectedAccount.username : 'Default avatar'"
      />
      <div class="flex flex-col justify-center">
        <p class="text-xs font-light text-gray-600 leading-none">Playing as</p>
        <h2 class="text-lg font-bold leading-none text-black truncate">{{ selectedAccount ? selectedAccount.username : 'Select account' }}</h2>
      </div>
      <DropdownIcon
        class="w-4 h-4 text-gray-600 ml-2 transition-transform"
        :class="{ 'rotate-180': showCard }"
      />
    </div>

    <transition name="fade">
      <Card
        v-if="showCard || mode === 'isolated'"
        ref="card"
        class="account-card"
        :class="{ expanded: mode === 'expanded', isolated: mode === 'isolated' }"
      >
        <div v-if="selectedAccount" class="selected account">
          <Avatar size="xs" :src="`https://crafatar.com/avatars/${selectedAccount.id}`" />
          <div class="flex-1 min-w-0">
            <h4 class="truncate">{{ selectedAccount.username }}</h4>
            <p>Selected</p>
          </div>
          <Button v-tooltip="'Log out'" icon-only color="raised" @click="logout(selectedAccount.id)">
            <TrashIcon />
          </Button>
        </div>
        <div v-else class="logged-out account">
          <h4>Not signed in</h4>
          <Button v-tooltip="'Log in'" icon-only color="primary" @click="login()">
            <LogInIcon />
          </Button>
        </div>
        <div v-if="displayAccounts.length > 0" class="account-group">
          <div v-for="account in displayAccounts" :key="account.id" class="account-row">
            <Button class="option account flex-1 min-w-0" @click="setAccount(account)">
              <Avatar :src="`https://crafatar.com/avatars/${account.id}`" class="icon" />
              <p class="truncate">{{ account.username }}</p>
            </Button>
            <Button v-tooltip="'Log out'" icon-only @click="logout(account.id)">
              <TrashIcon />
            </Button>
          </div>
        </div>
        <Button v-if="accounts.length > 0" @click="login()">
          <PlusIcon />
          Add account
        </Button>
      </Card>
    </transition>
  </div>
</template>

<script setup>
import { DropdownIcon, PlusIcon, TrashIcon, LogInIcon } from '@modrinth/assets'
import { Avatar, Button, Card } from '@modrinth/ui'
import { ref, computed, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import {
  users,
  remove_user,
  set_default_user,
  login as login_flow,
  get_default_user,
} from '@/helpers/auth'
import { handleError } from '@/store/state.js'
import { trackEvent } from '@/helpers/analytics'
import { process_listener } from '@/helpers/events'
import { handleSevereError } from '@/store/error.js'

defineProps({
  mode: {
    type: String,
    required: true,
    default: 'normal',
  },
})

const emit = defineEmits(['change'])

const accounts = ref({})
const defaultUser = ref()
const showCard = ref(false)
const card = ref(null)
const button = ref(null)

async function refreshValues() {
  defaultUser.value = await get_default_user().catch(handleError)
  accounts.value = await users().catch(handleError)
}
defineExpose({
  refreshValues,
})
await refreshValues()

const displayAccounts = computed(() =>
  accounts.value.filter((account) => defaultUser.value !== account.id),
)

const selectedAccount = computed(() =>
  accounts.value.find((account) => account.id === defaultUser.value),
)

function cleanupOldCaches() {
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('avatar_') || key.startsWith('crafatar_')) {
      try {
        const cached = JSON.parse(localStorage.getItem(key))
        if (now - cached.timestamp > oneWeek) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
  }
}

async function setAccount(account) {
  defaultUser.value = account.id
  await set_default_user(account.id).catch(handleError)
  if (selectedAccount.value) {
    localStorage.removeItem(`avatar_${selectedAccount.value.username}`)
    localStorage.removeItem(`crafatar_${selectedAccount.value.id}`)
  }
  emit('change')
}

const logout = async (id) => {
  const account = accounts.value.find(acc => acc.id === id)
  if (account) {
    localStorage.removeItem(`avatar_${account.username}`)
    localStorage.removeItem(`crafatar_${account.id}`)
  }
  await remove_user(id).catch(handleError)
  await refreshValues()
  if (!selectedAccount.value && accounts.value.length > 0) {
    await setAccount(accounts.value[0])
    await refreshValues()
  } else {
    emit('change')
  }
  trackEvent('AccountLogOut')
}

// Add cleanup to onMounted
onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  cleanupOldCaches()
})

const handleClickOutside = (event) => {
  const elements = document.elementsFromPoint(event.clientX, event.clientY)
  if (
    card.value &&
    card.value.$el !== event.target &&
    !elements.includes(card.value.$el) &&
    !button.value.contains(event.target)
  ) {
    toggleMenu(false)
  }
}

function toggleMenu(override = true) {
  if (showCard.value || !override) {
    showCard.value = false
  } else {
    showCard.value = true
  }
}

const unlisten = await process_listener(async (e) => {
  if (e.event === 'launched') {
    await refreshValues()
  }
})

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  unlisten()
})

function getCachedAvatarUrl(username) {
  const cached = localStorage.getItem(`avatar_${username}`)
  if (cached) {
    const { url, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
      return url
    }
  }
  const newUrl = `https://minecraftpfp.com/api/pfp/${username}.png`
  localStorage.setItem(`avatar_${username}`, JSON.stringify({
    url: newUrl,
    timestamp: Date.now()
  }))
  return newUrl
}

function getCachedCrafatarUrl(uuid) {
  const cached = localStorage.getItem(`crafatar_${uuid}`)
  if (cached) {
    const { url, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
      return url
    }
  }
  const newUrl = `https://crafatar.com/avatars/${uuid}`
  localStorage.setItem(`crafatar_${uuid}`, JSON.stringify({
    url: newUrl,
    timestamp: Date.now()
  }))
  return newUrl
}

const login = async () => {
  try {
    await login_flow()
    await refreshValues()
    trackEvent('AccountLogIn')
  } catch (error) {
    handleSevereError(error)
  }
}
</script>

<style scoped lang="scss">
.account-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center; /* Center items horizontally */
  justify-content: center; /* Center items vertically */
  top: calc(100% + 0.5rem);
  left: 0;
  z-index: 11;
  gap: 0.5rem;
  padding: 1rem;
  width: 100%; /* Matches the parent container's width */
  user-select: none;
  max-height: 98vh;
  overflow-y: auto;
  overflow-x: hidden;
  background: white;
  border-radius: var(--radius-xl);
  border: 2px solid var(--color-gray-700);
  box-shadow: var(--shadow-2xl);

  &.expanded {
    left: 13.5rem;
  }

  &.isolated {
    position: relative;
    left: 0;
    top: 0;
  }
}

.selected {
  background: #f05b32;
  border-radius: var(--radius-lg);
  color: var(--color-contrast);
  gap: 1rem;
}

.logged-out {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  gap: 1rem;
}

.account {
  width: max-content;
  display: flex;
  align-items: center;
  text-align: left;
  padding: 0.5rem 1rem;

  h4,
  p {
    margin: 0;
  }
}

.account-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option {
  width: calc(100% - 2.25rem);
  background: #292929;
  color: var(--color-contrast);
  box-shadow: none;

  img {
    margin-right: 0.5rem;
  }
}

.icon {
  --size: 1.5rem !important;
}

.account-row {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  vertical-align: center;
  justify-content: space-between;
  padding-right: 1rem;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.25s ease,
    translate 0.25s ease,
    scale 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  translate: 0 -2rem;
  scale: 0.9;
}

.avatar-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-base);
  background-color: var(--color-button-bg);
  border-radius: var(--radius-md);
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;

  &.expanded {
    border: 1px solid var(--color-button-bg);
    padding: 1rem;
  }
}

.avatar-text {
  margin: auto 0 auto 0.25rem;
  display: flex;
  flex-direction: column;
}

.text {
  width: 6rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.accounts-text {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
}

.qr-code {
  background-color: white !important;
  border-radius: var(--radius-md);
}

.modal-body {
  display: flex;
  flex-direction: row;
  gap: var(--gap-lg);
  align-items: center;
  padding: var(--gap-xl);

  .modal-text {
    display: flex;
    flex-direction: column;
    gap: var(--gap-sm);
    width: 100%;

    h2,
    p {
      margin: 0;
    }

    .code-text {
      display: flex;
      flex-direction: row;
      gap: var(--gap-xs);
      align-items: center;

      .code {
        background-color: var(--color-bg);
        border-radius: var(--radius-md);
        border: solid 1px var(--color-button-bg);
        font-family: var(--mono-font);
        letter-spacing: var(--gap-md);
        color: var(--color-contrast);
        font-size: 2rem;
        font-weight: bold;
        padding: var(--gap-sm) 0 var(--gap-sm) var(--gap-md);
      }

      .btn {
        width: 2.5rem;
        height: 2.5rem;
      }
    }
  }
}

.button-row {
  display: flex;
  flex-direction: row;
}

.modal {
  position: absolute;
}

.code {
  color: var(--color-brand);
  padding: 0.05rem 0.1rem;
  // row not column
  display: flex;

  .card {
    background: var(--color-base);
    color: var(--color-contrast);
    padding: 0.5rem 1rem;
  }
}
</style>
