import { Controller } from "@hotwired/stimulus"

// Handles push notification subscription
export default class extends Controller {
  static targets = ["status", "button"]

  async connect() {
    // Check if push is supported
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      this.updateStatus("Not supported")
      this.disableButton()
      return
    }

    // iOS requires PWA to be installed for push
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isIOS && !this.isStandalone()) {
      this.updateStatus("Add to Home Screen first")
      this.disableButton()
      return
    }

    // Check current permission and subscription state
    if (Notification.permission === "denied") {
      this.updateStatus("Blocked in browser")
      this.disableButton()
      return
    }

    // Check if already subscribed
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        this.updateStatus("Notifications on")
        this.disableButton()
        // Re-sync subscription with server to ensure user_id is set
        this.syncSubscription(subscription)
      }
      // If permission granted but no subscription, leave button active
    } catch (error) {
      console.error("Error checking subscription:", error)
    }
  }

  disableButton() {
    if (this.hasButtonTarget) {
      this.buttonTarget.disabled = true
      this.buttonTarget.classList.add("opacity-50", "cursor-not-allowed")
      this.buttonTarget.classList.remove("hover:text-gray-300")
    }
  }

  async requestPermission() {
    try {
      console.log("Push: Requesting permission...")
      this.updateStatus("Requesting...")

      const permission = await Notification.requestPermission()
      console.log("Push: Permission result:", permission)

      if (permission === "granted") {
        this.updateStatus("Subscribing...")
        await this.subscribe()
      } else {
        this.updateStatus("Blocked")
        this.disableButton()
      }
    } catch (error) {
      console.error("Permission error:", error)
      this.updateStatus("Error: " + error.message.substring(0, 15))
    }
  }

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true
  }

  async subscribe() {
    try {
      this.updateStatus("Getting SW...")
      const registration = await navigator.serviceWorker.ready

      this.updateStatus("Getting key...")
      const response = await fetch("/push/vapid_public_key")
      const { vapid_public_key } = await response.json()

      const applicationServerKey = this.urlBase64ToUint8Array(vapid_public_key)

      // This is where iOS often hangs
      this.updateStatus("Push subscribe...")

      // Add timeout for iOS
      const subscribePromise = registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout - iOS bug")), 10000)
      )

      const subscription = await Promise.race([subscribePromise, timeoutPromise])

      this.updateStatus("Saving...")
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

      this.updateStatus("Notifications on")
      this.disableButton()
    } catch (error) {
      console.error("Push subscription failed:", error.name, error.message, error)
      // Show more of the error for debugging
      const msg = error.message || error.name || "Unknown error"
      this.updateStatus("Failed: " + msg.substring(0, 30))
    }
  }

  async syncSubscription(subscription) {
    try {
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
    } catch (error) {
      console.error("Sync subscription failed:", error)
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
