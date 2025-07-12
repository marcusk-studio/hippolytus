<script setup>
import { onUnmounted, ref, shallowRef } from 'vue'
import { list } from '@/helpers/profile.js'
import { useRoute } from 'vue-router'
import { useBreadcrumbs } from '@/store/breadcrumbs.js'
import { profile_listener } from '@/helpers/events.js'
import { handleError } from '@/store/notifications.js'
import { Button, ContentPageHeader } from '@modrinth/ui'
import { PlusIcon, GameIcon, TimerIcon } from '@modrinth/assets'
import InstanceCreationModal from '@/components/ui/InstanceCreationModal.vue'
import { NewInstanceImage } from '@/assets/icons'
import NavTabs from '@/components/ui/NavTabs.vue'

const route = useRoute()
const breadcrumbs = useBreadcrumbs()

breadcrumbs.setRootContext({ name: 'Library', link: route.path })

const instances = shallowRef(await list().catch(handleError))

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
  offline.value = true
})
window.addEventListener('online', () => {
  offline.value = false
})

const unlistenProfile = await profile_listener(async () => {
  instances.value = await list().catch(handleError)
})
onUnmounted(() => {
  unlistenProfile()
})
</script>

<template>
  <div class="library-container">
    <div class="p-6 pt-6 flex-1 min-h-0">
      <InstanceCreationModal ref="installationModal" />
      <template v-if="instances.length > 0">
        <RouterView :instances="instances" />
      </template>
      <div v-else class="no-instance">
        <div class="icon">
          <NewInstanceImage />
        </div>
        <h3>No instances found</h3>
        <p class="no-instance-description">Create your first Minecraft instance to get started</p>
        <Button color="primary" :disabled="offline" @click="$refs.installationModal.show()">
          <PlusIcon />
          Create new instance
        </Button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.library-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-secondary) 100%);
  overflow: hidden;
}

.no-instance {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  gap: var(--gap-lg);
  text-align: center;

  p,
  h3 {
    margin: 0;
  }

  .no-instance-description {
    color: var(--color-secondary);
    font-size: 1.125rem;
    max-width: 400px;
  }

  .icon {
    svg {
      width: 12rem;
      height: 12rem;
      opacity: 0.7;
    }
  }
}

.blur-background {
  backdrop-filter: blur(5px);
  height: 82vh;
}
</style>
