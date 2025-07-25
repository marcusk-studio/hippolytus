<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Button, ButtonStyled, Card } from '@modrinth/ui'
import { XIcon, BellIcon, LeftArrowIcon, RightArrowIcon } from '@modrinth/assets'
import ModalWrapper from './modal/ModalWrapper.vue'
import { get, set } from '@/helpers/settings.js'
import { useFetch } from '@/helpers/fetch.js'
import dayjs from 'dayjs'

interface Update {
  id: string
  title: string
  content: string
  published: string
  author: string
  htmlContent: string
  featuredImage?: string
  summary: string
  label?: string
}

const modal = ref<any>(null)
const updates = ref<Update[]>([])
const loading = ref(false)
const lastUpdateCheck = ref<string | null>(null)
const lastUpdateId = ref<string | null>(null)
const lastBuildDate = ref<string | null>(null)
const selectedUpdate = ref<Update | null>(null)
const showDetailView = ref(false)
const currentCarouselIndex = ref(0)

const currentUpdate = computed(() => updates.value[currentCarouselIndex.value])
const hasNextUpdate = computed(() => currentCarouselIndex.value < updates.value.length - 1)
const hasPrevUpdate = computed(() => currentCarouselIndex.value > 0)

function nextUpdate() {
  if (hasNextUpdate.value) {
    currentCarouselIndex.value++
    setTimeout(() => {
    }, 50)
  }
}

function prevUpdate() {
  if (hasPrevUpdate.value) {
    currentCarouselIndex.value--
    setTimeout(() => {
    }, 50)
  }
}

function goToUpdate(index: number) {
  if (index !== currentCarouselIndex.value) {
    currentCarouselIndex.value = index
    setTimeout(() => {
    }, 50)
  }
}

async function fetchUpdates() {
  loading.value = true
  try {
    const response = await fetch('https://marcusk-studio.noticeable.news/feed.rss')
    const text = await response.text()
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(text, 'text/xml')
    
    const lastBuildDateElement = xmlDoc.querySelector('lastBuildDate')
    if (lastBuildDateElement) {
      lastBuildDate.value = lastBuildDateElement.textContent
    }
    
    const items = xmlDoc.querySelectorAll('item')
    const parsedUpdates: Update[] = []
    
    items.forEach(item => {
      const id = item.querySelector('guid')?.textContent || ''
      const title = item.querySelector('title')?.textContent || ''
      const description = item.querySelector('description')?.textContent || ''
      let contentEncoded = ''
      const contentElement = item.querySelector('content\\:encoded')
      if (contentElement) {
        contentEncoded = contentElement.textContent || ''
      } else {
        const allElements = item.getElementsByTagName('*')
        for (let i = 0; i < allElements.length; i++) {
          const element = allElements[i]
          if (element.tagName.toLowerCase() === 'content:encoded') {
            contentEncoded = element.textContent || ''
            break
          }
        }
      }
      const published = item.querySelector('pubDate')?.textContent || ''
      const authorFull = item.querySelector('author')?.textContent || ''
      
      let author = authorFull
      
      if (authorFull.includes('(') && authorFull.includes(')')) {
        const startIndex = authorFull.indexOf('(') + 1
        const endIndex = authorFull.indexOf(')')
        if (startIndex < endIndex) {
          author = authorFull.substring(startIndex, endIndex)
        }
      }
      
      const category = item.querySelector('category')
      const label = category?.textContent || 'Update'
      
      let featuredImage = undefined
      const mediaContent = item.querySelector('media\\:content')
      if (mediaContent) {
        featuredImage = mediaContent.getAttribute('url') || undefined
      } else {
        const allElements = item.getElementsByTagName('*')
        for (let i = 0; i < allElements.length; i++) {
          const element = allElements[i]
          if (element.tagName.toLowerCase() === 'media:content') {
            featuredImage = element.getAttribute('url') || undefined
            break
          }
        }
      }
      
      if (!featuredImage && contentEncoded) {
        const imgMatch = contentEncoded.match(/<img[^>]+src="([^"]+)"[^>]*>/i)
        featuredImage = imgMatch ? imgMatch[1] : undefined
      }
      
      if (featuredImage && featuredImage.startsWith('/')) {
        featuredImage = `https://marcusk-studio.noticeable.news${featuredImage}`
      }
      
      const fullContent = contentEncoded || description
      

      
      const plainText = description.replace(/<[^>]*>/g, '')
      const summary = plainText.length > 150 ? plainText.substring(0, 150) + '...' : plainText
      
      parsedUpdates.push({
        id,
        title,
        content: fullContent,
        published: published ? dayjs(published).format('MMMM D, YYYY') : '',
        author,
        htmlContent: fullContent,
        featuredImage,
        summary,
        label
      })
    })
    
    updates.value = parsedUpdates
  } catch (error) {
    console.error('Failed to fetch updates:', error)
  } finally {
    loading.value = false
  }
}

async function shouldShowModal() {
  try {
    const settings = await get()
    const lastCheck = settings.last_update_check || null
    const lastId = settings.last_update_id || null
    const lastBuildDateStored = settings.last_build_date || null
    
    lastUpdateCheck.value = lastCheck
    lastUpdateId.value = lastId
    
    if (lastBuildDate.value && lastBuildDateStored) {
      return lastBuildDate.value !== lastBuildDateStored
    }
    
    if (updates.value.length > 0) {
      const latestUpdate = updates.value[0]
      return latestUpdate.id !== lastId
    }
    
    return false
  } catch (error) {
    console.error('Failed to check update status:', error)
    return false
  }
}

async function markUpdatesAsSeen() {
  try {
    const settings = await get()
    const latestUpdate = updates.value[0]
    
    if (latestUpdate) {
      settings.last_update_check = new Date().toISOString()
      settings.last_update_id = latestUpdate.id

      if (lastBuildDate.value) {
        settings.last_build_date = lastBuildDate.value
      }
      await set(settings)
    }
  } catch (error) {
    console.error('Failed to mark updates as seen:', error)
  }
}

function show() {
  modal.value?.show()
}

function hide() {
  markUpdatesAsSeen()
  showDetailView.value = false
  selectedUpdate.value = null
  modal.value?.hide()
}

function showUpdateDetail(update: Update) {
  selectedUpdate.value = update
  showDetailView.value = true
}

function backToList() {
  showDetailView.value = false
  selectedUpdate.value = null
}

async function checkAndShowModal() {
  await fetchUpdates()
  if (await shouldShowModal()) {
    show()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!showDetailView.value) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      prevUpdate()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      nextUpdate()
    }
  }
}

defineExpose({
  show,
  hide,
  checkAndShowModal
})

onMounted(() => {
  checkAndShowModal()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <ModalWrapper ref="modal" :show-ad-on-close="false" class="updates-modal-wrapper">
    <template #title>
      <div class="modal-title">
        <h1 class="title-text">Latest News & Updates</h1>
      </div>
    </template>
    
    <div class="updates-modal">
      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading news...</p>
      </div>
      
      <!-- No Updates State -->
      <div v-else-if="updates.length === 0" class="no-updates">
        <BellIcon class="no-updates-icon" />
        <p>No news available at the moment.</p>
      </div>
      
      <!-- Carousel View -->
      <Transition name="carousel-fade" mode="out-in">
        <div v-if="!showDetailView && currentUpdate" key="carousel" class="carousel-container">
          <!-- Main Carousel Item -->
          <div class="carousel-item" :key="currentUpdate.id">
            <!-- Background Image -->
            <div class="carousel-background" v-if="currentUpdate.featuredImage">
              <img :src="currentUpdate.featuredImage" :alt="currentUpdate.title" />
              <div class="background-overlay"></div>
            </div>
            <div class="carousel-background-placeholder" v-else>
              <BellIcon />
              <div class="background-overlay"></div>
            </div>
            
            <!-- Glassmorphism Content Card -->
            <div class="glassmorphism-card">
              <div class="card-header">
                <div class="update-labels">
                  <div class="update-label update-type-label">
                    <span class="label-text">{{ currentUpdate.label }}</span>
                  </div>
                  <div class="update-label update-date-label">
                    <span class="label-text">{{ currentUpdate.published }}</span>
                  </div>
                  <div v-if="currentUpdate.author" class="update-label update-author-label">
                    <span class="label-text">by {{ currentUpdate.author }}</span>
                  </div>
                </div>
              </div>
              
              <div class="card-content">
                <h2 class="card-title">{{ currentUpdate.title }}</h2>
                <p class="card-summary">{{ currentUpdate.summary }}</p>
                
                <div class="card-actions">
                  <Button color="primary" @click="showUpdateDetail(currentUpdate)">
                    Read Full Article
                  </Button>
                </div>
              </div>
            </div>
            
            <!-- Carousel Navigation -->
            <div class="carousel-navigation">
              <button 
                class="nav-button nav-prev" 
                :disabled="!hasPrevUpdate"
                @click="prevUpdate"
              >
                <LeftArrowIcon />
              </button>
              
              <button 
                class="nav-button nav-next" 
                :disabled="!hasNextUpdate"
                @click="nextUpdate"
              >
                <RightArrowIcon />
              </button>
            </div>
          </div>
          
          <!-- Bottom Dot Indicators -->
          <div class="bottom-indicators">
            <div class="indicator-dots">
              <button 
                v-for="(update, index) in updates" 
                :key="update.id"
                class="indicator-dot"
                :class="{ active: index === currentCarouselIndex }"
                @click="goToUpdate(index)"
                type="button"
              ></button>
            </div>
          </div>
        </div>
      </Transition>
      
      <!-- Detail View -->
      <Transition name="detail-fade" mode="out-in">
        <div v-if="showDetailView && selectedUpdate" key="detail" class="update-detail">
          <div class="detail-header">
            <button class="back-button" @click="backToList">
              <LeftArrowIcon />
              Back to News
            </button>
          </div>
          
          <Card class="detail-card">
            <div class="detail-content">
              <h1 class="detail-title">{{ selectedUpdate.title }}</h1>
              
              <div class="detail-meta">
                <div class="detail-labels">
                  <div class="detail-label detail-type-label">
                    <span class="label-text">{{ selectedUpdate.label }}</span>
                  </div>
                  <div class="detail-label detail-date-label">
                    <span class="label-text">{{ selectedUpdate.published }}</span>
                  </div>
                  <div v-if="selectedUpdate.author" class="detail-label detail-author-label">
                    <span class="label-text">by {{ selectedUpdate.author }}</span>
                  </div>
                </div>
              </div>
              
              <div v-if="selectedUpdate.featuredImage" class="detail-image">
                <img :src="selectedUpdate.featuredImage" :alt="selectedUpdate.title" />
              </div>
              
              <div class="markdown-body detail-body" v-html="selectedUpdate.content"></div>
            </div>
          </Card>
        </div>
      </Transition>
      

    </div>
  </ModalWrapper>
</template>

<style scoped>
:deep(.updates-modal-wrapper) {
  --modal-width: 900px !important;
  width: 900px !important;
}

.updates-modal {
  width: 900px;
  height: 600px;
  overflow: hidden;
  position: relative;
}

/* Modal Title Styles */
.modal-title {
  text-align: center;
  padding: 0.5rem 0;
}

.title-text {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-contrast);
  line-height: 1.2;
}

.title-subtitle {
  font-size: 0.9rem;
  color: var(--color-base);
  margin: 0.25rem 0 0 0;
  opacity: 0.8;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--color-base);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.no-updates {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  text-align: center;
}

.no-updates-icon {
  width: 3rem;
  height: 3rem;
  opacity: 0.5;
}

/* Carousel Container */
.carousel-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 0.5rem;
}

.carousel-item {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 1.5rem;
  margin-bottom: 0.5rem;
  margin: 0.25rem;
}

/* Background Image */
.carousel-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  border-radius: 1.5rem;
  overflow: hidden;
}

.carousel-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  animation: imageFadeIn 0.6s ease-out;
  border-radius: 1.5rem;
  overflow: hidden;
}

@keyframes imageFadeIn {
  from {
    opacity: 0;
    transform: scale(1.05);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Smooth transition for carousel content changes */
.carousel-item {
  transition: all 0.3s ease;
}

.carousel-item:hover {
  transform: scale(1.01);
}

.carousel-background-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-brand) 0%, var(--color-accent) 100%);
  opacity: 0.3;
  border-radius: 1.5rem;
}

.carousel-background-placeholder svg {
  width: 4rem;
  height: 4rem;
  color: white;
}

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 0.4) 50%,
    rgba(0, 0, 0, 0.7) 100%
  );
  z-index: 2;
}

/* Glassmorphism Card */
.glassmorphism-card {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.25rem;
  padding: 1rem;
  z-index: 3;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  transition: all 0.3s ease;
  max-height: calc(100% - 2rem);
  overflow: hidden;
}

.glassmorphism-card:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: translateY(-1px);
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.5);
}

.card-header {
  margin-bottom: 0.75rem;
}

.update-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: white;
  line-height: 1.2;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.card-summary {
  font-size: 0.85rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.card-actions {
  margin-top: 0.5rem;
}

/* Carousel Navigation */
.carousel-navigation {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.75rem;
  z-index: 4;
  pointer-events: none;
}

.nav-button {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  pointer-events: auto;
}

.nav-button:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.nav-button:active:not(:disabled) {
  transform: scale(0.95);
  transition: transform 0.1s ease;
}

.nav-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-button svg {
  width: 1.25rem;
  height: 1.25rem;
}

/* Bottom Dot Indicators */
.bottom-indicators {
  display: flex;
  justify-content: center;
  padding: 1rem 0;
  position: relative;
  z-index: 5;
}

.indicator-dots {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  padding: 0.75rem 1rem;
  border-radius: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-wrap: nowrap;
  text-align: center;
}

.indicator-dot {
  width: 0.5rem !important;
  height: 0.5rem !important;
  border-radius: 50% !important;
  border: none !important;
  background: rgba(255, 255, 255, 0.3) !important;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  display: inline-block;
  vertical-align: middle;
  padding: 0 !important;
  margin: 0 !important;
  line-height: 1 !important;
  box-sizing: border-box !important;
}

.indicator-dot.active {
  background: white;
  transform: scale(1.4);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
}

.indicator-dot:hover {
  background: rgba(255, 255, 255, 0.6);
  transform: scale(1.1);
}

.indicator-dot::before {
  content: '';
  position: absolute;
  top: -0.15rem;
  left: -0.15rem;
  right: -0.15rem;
  bottom: -0.15rem;
  border-radius: 50%;
  background: transparent;
  transition: all 0.3s ease;
}

.indicator-dot:hover::before {
  background: rgba(255, 255, 255, 0.1);
}

/* Transition Animations */
.carousel-fade-enter-active,
.carousel-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.detail-fade-enter-active,
.detail-fade-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.carousel-fade-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}

.carousel-fade-leave-to {
  opacity: 0;
  transform: translateX(-40px) scale(0.9);
}

.detail-fade-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.95);
}

.detail-fade-leave-to {
  opacity: 0;
  transform: translateY(-30px) scale(0.95);
}

/* Carousel slide animations */
.carousel-item {
  animation: carouselSlideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes carouselSlideIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Glassmorphism card entrance animation */
.glassmorphism-card {
  animation: cardSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
}

@keyframes cardSlideUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Carousel content change animation */
.carousel-background {
  animation: backgroundFadeIn 0.5s ease-out;
}

@keyframes backgroundFadeIn {
  from {
    opacity: 0;
    transform: scale(1.1);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 768px) {
  :deep(.updates-modal-wrapper) {
    width: 95vw !important;
    max-width: 500px !important;
  }
  
  .updates-modal {
    width: 95vw;
    max-width: 500px;
    height: 500px;
  }
  
  .title-text {
    font-size: 1.5rem;
  }
  
  .title-subtitle {
    font-size: 0.8rem;
  }
  
  .glassmorphism-card {
    bottom: 0.75rem;
    left: 0.75rem;
    right: 0.75rem;
    padding: 0.75rem;
  }
  
  .card-title {
    font-size: 1.1rem;
  }
  
  .card-summary {
    font-size: 0.75rem;
  }
  
  .nav-button {
    width: 2rem;
    height: 2rem;
  }
  
  .nav-button svg {
    width: 1rem;
    height: 1rem;
  }
  
  .bottom-indicators {
    padding: 0.75rem 0;
  }
  
  .indicator-dots {
    padding: 0.5rem 0.75rem;
  }
  
  .indicator-dot {
    width: 0.4rem !important;
    height: 0.4rem !important;
  }
  
  .indicator-dot.active {
    transform: scale(1.3);
  }
  
  .indicator-dot:hover {
    transform: scale(1.05);
  }
}

/* Update Labels - Enhanced for glassmorphism */
.update-label {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.update-type-label {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-weight: 600;
}

.update-date-label {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.update-author-label {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.label-text {
  font-size: 0.75rem;
  font-weight: 500;
}

.update-label {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.update-type-label {
  background: var(--color-brand-highlight);
  color: var(--color-brand);
  font-weight: 700;
}

.update-date-label {
  background: var(--color-button-bg);
  color: var(--color-secondary);
}

.update-author-label {
  background: var(--color-button-bg);
  color: var(--color-secondary);
}

.label-text {
  font-size: 0.75rem;
  font-weight: 600;
}

/* Detail View Styles */
.update-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-header {
  display: flex;
  align-items: center;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.75rem;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0.75rem 1rem;
  transition: all 0.2s ease;
  font-weight: 500;
}

.back-button:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.back-button svg {
  width: 1rem;
  height: 1rem;
}

.detail-card {
  flex: 1;
  overflow: hidden;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;
}

.detail-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-contrast);
  line-height: 1.3;
}

.detail-meta {
  display: flex;
  align-items: center;
}

.detail-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.detail-label {
  display: flex;
  align-items: center;
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.detail-type-label {
  background: var(--color-brand-highlight);
  color: var(--color-brand);
  font-weight: 700;
}

.detail-date-label {
  background: var(--color-button-bg);
  color: var(--color-secondary);
}

.detail-author-label {
  background: var(--color-button-bg);
  color: var(--color-secondary);
}

.detail-image {
  width: 100%;
  max-height: 400px;
  overflow: hidden;
  border-radius: 0.75rem;
  background: var(--color-bg-base);
}

.detail-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Markdown Body Styles - matching project page */
.markdown-body {
  line-height: 1.7;
  color: var(--color-base);
  font-size: 1rem;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  color: var(--color-contrast);
  margin: 1.5rem 0 1rem 0;
  font-weight: 600;
}

.markdown-body h1 { font-size: 1.75rem; }
.markdown-body h2 { font-size: 1.5rem; }
.markdown-body h3 { font-size: 1.25rem; }
.markdown-body h4 { font-size: 1.125rem; }
.markdown-body h5 { font-size: 1rem; }
.markdown-body h6 { font-size: 0.875rem; }

.markdown-body p {
  margin: 0 0 1rem 0;
}

.markdown-body strong,
.markdown-body b {
  font-weight: 600;
  color: var(--color-contrast);
}

.markdown-body em,
.markdown-body i {
  font-style: italic;
}

.markdown-body a {
  color: var(--color-accent);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body ul,
.markdown-body ol {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.markdown-body li {
  margin: 0.5rem 0;
}

.markdown-body blockquote {
  border-left: 4px solid var(--color-accent);
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  opacity: 0.8;
}

.markdown-body code {
  background: var(--color-bg-raised);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
}

.markdown-body pre {
  background: var(--color-bg-raised);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1rem 0;
}

.markdown-body pre code {
  background: none;
  padding: 0;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.markdown-body table td,
.markdown-body table th {
  border: 1px solid var(--color-border);
  padding: 0.5rem;
  text-align: left;
}

.markdown-body table th {
  background: var(--color-bg-raised);
  font-weight: 600;
}

.markdown-body figure {
  margin: 1rem 0;
  text-align: center;
}

.markdown-body figure img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

.markdown-body span[style*="color"] {
  /* Preserve custom colors from RSS content */
  color: inherit !important;
}

.markdown-body hr,
.markdown-body h1,
.markdown-body h2,
.markdown-body img {
  max-width: max(60rem, 90%) !important;
}

.markdown-body ul,
.markdown-body ol {
  margin-left: 2rem;
}

.modal-footer {
  display: flex;
  justify-content: center;
  padding-top: 1.5rem;
  margin-top: 1.5rem;
  border-top: 1px solid var(--color-border);
}

.modal-footer :deep(.button-styled) {
  min-width: 120px;
  font-weight: 600;
  font-size: 1rem;
  padding: 0.75rem 1.5rem;
}
</style> 