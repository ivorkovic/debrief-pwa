import { Controller } from "@hotwired/stimulus"

// Handles push notification subscription
export default class extends Controller {
  static targets = ["status", "prompt"]

  async connect() {
    // Check if push is supported
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      this.hidePrompt()
      return
    }

    // Check current permission state
    if (Notification.permission === "granted") {
      await this.subscribe()
      this.hidePrompt()
    } else if (Notification.permission === "denied") {
      this.updateStatus("Blocked")
    }
  }

  hidePrompt() {
    if (this.hasPromptTarget) {
      this.promptTarget.classList.add("hidden")
    }
  }

  async requestPermission() {
    const permission = await Notification.requestPermission()

    if (permission === "granted") {
      await this.subscribe()
      this.hidePrompt()
    } else {
      this.updateStatus("Denied")
    }
  }

  async subscribe() {
    try {
      const registration = await navigator.serviceWorker.ready

      // Get VAPID public key from server
      const response = await fetch("/push/vapid_public_key")
      const { vapid_public_key } = await response.json()

      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlBase64ToUint8Array(vapid_public_key)

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      })

      // Send subscription to server
      const keys = subscription.toJSON().keys
      await fetch("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth
        })
      })

      this.updateStatus("Notifications enabled")
    } catch (error) {
      console.error("Push subscription failed:", error)
      this.updateStatus("Subscription failed")
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/")

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  updateStatus(message) {
    if (this.hasStatusTarget) {
      this.statusTarget.textContent = message
    }
  }
}
