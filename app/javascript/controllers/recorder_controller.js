import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["idleButton", "recordingButton", "timer", "status", "previewButtons"]

  connect() {
    this.state = "idle" // idle, recording, preview
    this.mediaRecorder = null
    this.audioChunks = []
    this.audioBlob = null
    this.startTime = null
    this.timerInterval = null
    this.wakeLock = null
    this.stream = null

    // iOS PWA: Handle app backgrounding - iOS kills audio sessions
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this)
    document.addEventListener("visibilitychange", this.handleVisibilityChange)
  }

  disconnect() {
    // Cleanup when controller is removed from DOM
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
    this.cleanup()
  }

  handleVisibilityChange() {
    if (document.hidden && this.state === "recording") {
      // iOS kills audio when backgrounded - auto-stop to prevent zombie state
      console.log("App backgrounded during recording - auto-stopping")
      this.stop()
    }
  }

  cleanup() {
    // Stop all tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    // Stop timer
    this.stopTimer()
    // Release wake lock
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {})
      this.wakeLock = null
    }
    // Clear audio data
    this.audioChunks = []
    this.audioBlob = null
    this.mediaRecorder = null
  }

  async start() {
    try {
      // iOS-friendly audio constraints (no sampleRate - iOS rejects it)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,  // More reliable on iOS
          noiseSuppression: false,  // More reliable on iOS
          autoGainControl: true
        }
      })

      this.stream = stream

      // Get MIME type, try-catch MediaRecorder construction for iOS
      const mimeType = this.getSupportedMimeType()
      try {
        if (mimeType) {
          this.mediaRecorder = new MediaRecorder(stream, { mimeType })
        } else {
          // Let browser choose default
          this.mediaRecorder = new MediaRecorder(stream)
        }
      } catch (e) {
        console.warn("MediaRecorder with mimeType failed, using default:", e)
        this.mediaRecorder = new MediaRecorder(stream)
      }

      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        this.audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType })
        this.showPreview()
      }

      // iOS fix: Handle MediaRecorder errors
      this.mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error)
        this.statusTarget.textContent = "Recording failed"
        this.cleanup()
        this.state = "idle"
        this.updateUI()
      }

      this.mediaRecorder.start(1000)
      this.state = "recording"
      this.startTime = Date.now()
      this.startTimer()
      this.updateUI()

      // Request wake lock to prevent screen sleep during recording
      if ("wakeLock" in navigator) {
        try {
          this.wakeLock = await navigator.wakeLock.request("screen")
        } catch (err) {
          console.log("Wake Lock not supported or failed:", err)
        }
      }
    } catch (error) {
      console.error("Failed to start recording:", error)
      // Better error messages for different error types
      if (error.name === "NotAllowedError") {
        this.statusTarget.textContent = "Microphone access denied"
      } else if (error.name === "NotFoundError") {
        this.statusTarget.textContent = "No microphone found"
      } else if (error.name === "OverconstrainedError") {
        this.statusTarget.textContent = "Microphone incompatible"
      } else {
        this.statusTarget.textContent = "Recording failed. Try again."
      }
      // Cleanup any partial resources
      this.cleanup()
    }
  }

  async stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      // iOS fix: onstop might not fire - add timeout fallback
      const stopPromise = new Promise((resolve) => {
        const originalOnStop = this.mediaRecorder.onstop
        this.mediaRecorder.onstop = () => {
          if (originalOnStop) originalOnStop.call(this.mediaRecorder)
          resolve()
        }
        // Timeout fallback for iOS - if onstop doesn't fire within 2s
        setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === "inactive") {
            console.log("MediaRecorder onstop timeout - forcing preview")
            if (this.audioChunks.length > 0) {
              this.audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || "audio/mp4" })
              this.showPreview()
            }
            resolve()
          }
        }, 2000)
      })

      this.mediaRecorder.stop()
      await stopPromise
    }
    this.stopTimer()

    if (this.wakeLock) {
      await this.wakeLock.release()
      this.wakeLock = null
    }
    // Don't change state here - onstop will call showPreview
  }

  async cancel() {
    this.cleanup()
    this.state = "idle"
    this.timerTarget.textContent = "00:00"
    this.updateUI()
  }

  showPreview() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.state = "preview"
    this.updateUI()
  }

  async send() {
    if (!this.audioBlob) return

    this.statusTarget.textContent = "Uploading..."
    this.previewButtonsTarget.classList.add("hidden")

    const mimeType = this.mediaRecorder?.mimeType || "audio/mp4"
    const extension = mimeType.includes("mp4") ? "mp4" : "webm"

    const formData = new FormData()
    formData.append("audio", this.audioBlob, `debrief_${Date.now()}.${extension}`)

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    try {
      const response = await fetch("/debriefs", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken,
          "Accept": "text/html"
        },
        body: formData
      })

      if (response.redirected) {
        window.location.href = response.url
      } else if (response.ok) {
        window.location.href = "/debriefs"
      } else {
        this.statusTarget.textContent = "Upload failed. Try again."
        this.previewButtonsTarget.classList.remove("hidden")
      }
    } catch (error) {
      this.statusTarget.textContent = "Upload failed. Try again."
      this.previewButtonsTarget.classList.remove("hidden")
      console.error("Upload error:", error)
    }
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0")
      const seconds = (elapsed % 60).toString().padStart(2, "0")
      this.timerTarget.textContent = `${minutes}:${seconds}`
    }, 100)
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  updateUI() {
    // Hide all buttons first
    this.idleButtonTarget.classList.add("hidden")
    this.recordingButtonTarget.classList.add("hidden")
    this.previewButtonsTarget.classList.add("hidden")

    if (this.state === "idle") {
      this.idleButtonTarget.classList.remove("hidden")
      this.statusTarget.textContent = "Tap to record"
    } else if (this.state === "recording") {
      this.recordingButtonTarget.classList.remove("hidden")
      this.statusTarget.textContent = "Recording..."
    } else if (this.state === "preview") {
      this.previewButtonsTarget.classList.remove("hidden")
      this.statusTarget.textContent = "Send or cancel?"
    }
  }

  getSupportedMimeType() {
    // iOS Safari ONLY supports audio/mp4 - check it FIRST
    const types = [
      "audio/mp4",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log("Using MIME type:", type)
        return type
      }
    }

    // Return empty to let browser use default (safer than hardcoding unsupported type)
    console.warn("No supported MIME type found, using browser default")
    return ""
  }
}
