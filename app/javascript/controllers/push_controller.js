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
    console.log("Push: Requesting permission...")
    const permission = await Notification.requestPermission()
    console.log("Push: Permission result:", permission)

    if (permission === "granted") {
      await this.subscribe()
    } else {
      this.updateStatus("Blocked in browser")
      this.disableButton()
    }
  }

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true
  }

  async subscribe() {
    try {
      console.log("Push: Getting service worker registration...")
      const registration = await navigator.serviceWorker.ready
      console.log("Push: Service worker ready")

      // Get VAPID public key from server
      console.log("Push: Fetching VAPID key...")
      const response = await fetch("/push/vapid_public_key")
      const { vapid_public_key } = await response.json()
      console.log("Push: Got VAPID key")

      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlBase64ToUint8Array(vapid_public_key)

      // Subscribe to push
      console.log("Push: Subscribing to push manager...")
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      })
      console.log("Push: Got subscription:", subscription.endpoint)

      // Send subscription to server
      const keys = subscription.toJSON().keys
      console.log("Push: Sending to server...")
      const saveResponse = await fetch("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth
        })
      })
      console.log("Push: Server response:", saveResponse.status)

      this.updateStatus("Notifications on")
      this.disableButton()
    } catch (error) {
      console.error("Push subscription failed:", error)
      this.updateStatus("Failed: " + error.message.substring(0, 20))
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
