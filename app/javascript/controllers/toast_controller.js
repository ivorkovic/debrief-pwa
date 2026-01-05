import { Controller } from "@hotwired/stimulus"

// Toast notification controller
// Usage: Add data-controller="toast" to a container, then call show() with type and message
export default class extends Controller {
  static targets = ["container"]

  connect() {
    // Create toast container if it doesn't exist
    if (!document.getElementById("toast-container")) {
      const container = document.createElement("div")
      container.id = "toast-container"
      container.className = "fixed top-4 left-4 right-4 z-50 flex flex-col items-center pointer-events-none"
      document.body.appendChild(container)
    }
  }

  // Show a toast notification
  // type: "success" | "error"
  // message: string to display
  // duration: ms before auto-dismiss (default 3000)
  show(type, message, duration = 3000) {
    const container = document.getElementById("toast-container")
    if (!container) return

    const toast = document.createElement("div")
    toast.className = this.getToastClasses(type)
    toast.innerHTML = `
      <div class="flex items-center gap-2">
        ${this.getIcon(type)}
        <span>${message}</span>
      </div>
    `

    // Start hidden for animation
    toast.style.opacity = "0"
    toast.style.transform = "translateY(-20px)"
    container.appendChild(toast)

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transition = "opacity 0.3s ease, transform 0.3s ease"
      toast.style.opacity = "1"
      toast.style.transform = "translateY(0)"
    })

    // Auto dismiss
    setTimeout(() => {
      toast.style.opacity = "0"
      toast.style.transform = "translateY(-20px)"
      setTimeout(() => toast.remove(), 300)
    }, duration)
  }

  getToastClasses(type) {
    const base = "px-4 py-3 rounded-lg shadow-lg pointer-events-auto mb-2 max-w-sm"
    if (type === "success") {
      return `${base} bg-green-500 text-white`
    } else if (type === "error") {
      return `${base} bg-red-500 text-white`
    }
    return `${base} bg-gray-700 text-white`
  }

  getIcon(type) {
    if (type === "success") {
      return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>`
    } else if (type === "error") {
      return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>`
    }
    return ""
  }
}

// Global helper for showing toasts from any controller
window.showToast = (type, message, duration) => {
  const container = document.getElementById("toast-container") || createToastContainer()

  const toast = document.createElement("div")
  const base = "px-4 py-3 rounded-lg shadow-lg pointer-events-auto mb-2 max-w-sm"

  if (type === "success") {
    toast.className = `${base} bg-green-500 text-white`
  } else if (type === "error") {
    toast.className = `${base} bg-red-500 text-white`
  } else {
    toast.className = `${base} bg-gray-700 text-white`
  }

  const icon = type === "success"
    ? `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`
    : type === "error"
    ? `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`
    : ""

  toast.innerHTML = `<div class="flex items-center gap-2">${icon}<span>${message}</span></div>`
  toast.style.opacity = "0"
  toast.style.transform = "translateY(-20px)"
  container.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.transition = "opacity 0.3s ease, transform 0.3s ease"
    toast.style.opacity = "1"
    toast.style.transform = "translateY(0)"
  })

  setTimeout(() => {
    toast.style.opacity = "0"
    toast.style.transform = "translateY(-20px)"
    setTimeout(() => toast.remove(), 300)
  }, duration || 3000)
}

function createToastContainer() {
  const container = document.createElement("div")
  container.id = "toast-container"
  container.className = "fixed top-4 left-4 right-4 z-50 flex flex-col items-center pointer-events-none"
  document.body.appendChild(container)
  return container
}
