<script setup lang="ts">
import { ref } from 'vue'
import { NewModal as Modal } from '@modrinth/ui'
import { show_ads_window, hide_ads_window } from '@/helpers/ads.js'
import { useTheming } from '@/store/theme.js'

const themeStore = useTheming()

const props = defineProps({
  header: {
    type: String,
    default: null,
  },
  closable: {
    type: Boolean,
    default: true,
  },
  onHide: {
    type: Function,
    default() {
      return () => { }
    },
  },
  showAdOnClose: {
    type: Boolean,
    default: true,
  },
  class: {
    type: [String, Array, Object],
    default: '',
  },
})
const modal = ref<any>(null)

defineExpose({
  show: () => {
    hide_ads_window()
    modal.value?.show()
  },
  hide: () => {
    onModalHide()
    modal.value?.hide()
  },
})

function onModalHide() {
  if (props.showAdOnClose) {
    show_ads_window()
  }
  props.onHide()
}
</script>

<template>
  <Teleport to="body">
    <Modal 
      ref="modal" 
      :header="header" 
      :noblur="!themeStore.advancedRendering" 
      :class="['modal-wrapper', props.class]"
      v-bind="$attrs"
      @hide="onModalHide"
    >
      <template #title>
        <slot name="title" />
      </template>
      <slot />
    </Modal>
  </Teleport>
</template>
