import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["idleButton", "recordingButton", "timer", "status", "previewButtons", "modeToggle", "textInput", "textButtons", "recordSection", "textSection"]

  // Upload config
  static MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - enough for ~90 min of voice audio
  static UPLOAD_TIMEOUT = 60000 // 60 seconds
  static MAX_RETRIES = 3

  connect() {
    this.state = "idle" // idle, recording, preview, text_input
    this.mode = "audio" // audio or text
    this.mediaRecorder = null
    this.audioChunks = []
    this.audioBlob = null
    this.startTime = null
    this.timerInterval = null
    this.wakeLock = null
    this.stream = null
    this.permissionGranted = localStorage.getItem("mic_permission") === "granted"

    // iOS PWA: Handle app backgrounding - iOS kills audio sessions
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this)
    document.addEventListener("visibilitychange", this.handleVisibilityChange)

    // Listen for permission changes
    this.setupPermissionListener()
  }

  disconnect() {
    // Cleanup when controller is removed from DOM
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
    this.cleanup()
  }

  async setupPermissionListener() {
    // Listen for permission state changes (user toggling in settings)
    try {
      const permission = await navigator.permissions.query({ name: "microphone" })
      permission.addEventListener("change", () => {
        if (permission.state === "granted") {
          localStorage.setItem("mic_permission", "granted")
          this.permissionGranted = true
        } else {
          localStorage.removeItem("mic_permission")
          this.permissionGranted = false
        }
      })
      // Sync initial state
      if (permission.state === "granted") {
        localStorage.setItem("mic_permission", "granted")
        this.permissionGranted = true
      }
    } catch (e) {
      // Permissions API not supported (older browsers) - continue without caching
      console.log("Permissions API not available")
    }
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
      // Check permission state BEFORE requesting (fixes iOS "every other time" issue)
      try {
        const permission = await navigator.permissions.query({ name: "microphone" })
        if (permission.state === "denied") {
          this.statusTarget.textContent = "Microphone access denied. Check settings."
          return
        }
      } catch (e) {
        // Permissions API not available - proceed with getUserMedia
      }

      // iOS-friendly audio constraints (no sampleRate - iOS rejects it)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,  // More reliable on iOS
          noiseSuppression: false,  // More reliable on iOS
          autoGainControl: true
        }
      })

      // Mark permission as granted for future checks
      localStorage.setItem("mic_permission", "granted")
      this.permissionGranted = true

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
      this.onstopCalled = false // Flag to prevent double processing

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      // Set onstop ONCE here - don't re-bind in stop()
      this.mediaRecorder.onstop = () => {
        if (this.onstopCalled) return // Prevent double processing
        this.onstopCalled = true
        this.finalizeRecording()
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
        localStorage.removeItem("mic_permission")
        this.permissionGranted = false
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

  finalizeRecording() {
    // Stop stream IMMEDIATELY (fixes iOS permission persistence)
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || "audio/mp4" })
    this.state = "preview"
    this.updateUI()
  }

  async stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      // Stop the recorder - onstop callback (set in start()) will call finalizeRecording
      this.mediaRecorder.stop()

      // iOS fallback: if onstop doesn't fire within 2s, force finalization
      setTimeout(() => {
        if (!this.onstopCalled && this.audioChunks.length > 0) {
          console.log("MediaRecorder onstop timeout - forcing finalization")
          this.onstopCalled = true
          this.finalizeRecording()
        }
      }, 2000)
    }
    this.stopTimer()

    if (this.wakeLock) {
      await this.wakeLock.release()
      this.wakeLock = null
    }
  }

  async cancel() {
    this.cleanup()
    this.state = "idle"
    this.timerTarget.textContent = "00:00"
    this.updateUI()
  }

  // Mode switching for audio/text toggle
  selectMode(event) {
    const mode = event.currentTarget.dataset.mode
    this.mode = mode

    // Update toggle button styles
    this.modeToggleTargets.forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add("bg-gray-700", "text-white")
        btn.classList.remove("text-gray-400")
      } else {
        btn.classList.remove("bg-gray-700", "text-white")
        btn.classList.add("text-gray-400")
      }
    })

    if (mode === "text") {
      this.state = "text_input"
      this.recordSectionTarget.classList.add("hidden")
      this.textSectionTarget.classList.remove("hidden")
      this.textInputTarget.focus()
    } else {
      this.state = "idle"
      this.recordSectionTarget.classList.remove("hidden")
      this.textSectionTarget.classList.add("hidden")
    }
    this.updateUI()
  }

  async sendText() {
    const text = this.textInputTarget.value.trim()
    if (!text) {
      this.statusTarget.textContent = "Type something first"
      return
    }

    this.statusTarget.textContent = "Sending..."
    this.textButtonsTarget.classList.add("hidden")

    const formData = new FormData()
    formData.append("text_content", text)
    formData.append("entry_type", "text")

    await this.uploadWithRetry(formData)
  }

  cancelText() {
    this.textInputTarget.value = ""
    this.statusTarget.textContent = "Type your message"
    this.textButtonsTarget.classList.remove("hidden")
  }

  async send() {
    if (!this.audioBlob) return

    // Check file size before upload
    if (this.audioBlob.size > this.constructor.MAX_FILE_SIZE) {
      const sizeMB = Math.round(this.audioBlob.size / 1024 / 1024)
      this.statusTarget.textContent = `Recording too large (${sizeMB}MB). Max 50MB.`
      this.previewButtonsTarget.classList.remove("hidden")
      return
    }

    // Check network connectivity
    if (!navigator.onLine) {
      this.statusTarget.textContent = "No internet connection"
      this.previewButtonsTarget.classList.remove("hidden")
      return
    }

    this.statusTarget.textContent = "Uploading..."
    this.previewButtonsTarget.classList.add("hidden")

    const mimeType = this.mediaRecorder?.mimeType || "audio/mp4"
    const extension = mimeType.includes("mp4") ? "mp4" : "webm"

    const formData = new FormData()
    formData.append("audio", this.audioBlob, `debrief_${Date.now()}.${extension}`)
    formData.append("entry_type", "audio")

    await this.uploadWithRetry(formData)
  }

  async uploadWithRetry(formData, attempt = 1) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.constructor.UPLOAD_TIMEOUT)

    try {
      const response = await fetch("/debriefs", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken,
          "Accept": "text/html"
        },
        body: formData,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.redirected) {
        window.location.href = response.url
      } else if (response.ok) {
        window.location.href = "/debriefs"
      } else {
        throw new Error(`Server error: ${response.status}`)
      }
    } catch (error) {
      clearTimeout(timeoutId)

      // Retry logic with exponential backoff
      if (attempt < this.constructor.MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
        this.statusTarget.textContent = `Retry ${attempt}/${this.constructor.MAX_RETRIES - 1}...`
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.uploadWithRetry(formData, attempt + 1)
      }

      // All retries failed
      if (error.name === "AbortError") {
        this.statusTarget.textContent = "Upload timed out. Try again."
      } else if (!navigator.onLine) {
        this.statusTarget.textContent = "Connection lost. Try again."
      } else {
        this.statusTarget.textContent = "Upload failed. Try again."
      }

      // Show appropriate buttons based on mode
      if (this.mode === "text") {
        this.textButtonsTarget.classList.remove("hidden")
      } else {
        this.previewButtonsTarget.classList.remove("hidden")
      }
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
    // Hide all audio buttons first
    this.idleButtonTarget.classList.add("hidden")
    this.recordingButtonTarget.classList.add("hidden")
    this.previewButtonsTarget.classList.add("hidden")

    // Hide text buttons if they exist
    if (this.hasTextButtonsTarget) {
      this.textButtonsTarget.classList.add("hidden")
    }

    if (this.state === "idle") {
      this.idleButtonTarget.classList.remove("hidden")
      this.statusTarget.textContent = "Tap to record"
    } else if (this.state === "recording") {
      this.recordingButtonTarget.classList.remove("hidden")
      this.statusTarget.textContent = "Recording..."
    } else if (this.state === "preview") {
      this.previewButtonsTarget.classList.remove("hidden")
      this.statusTarget.textContent = "Send or cancel?"
    } else if (this.state === "text_input") {
      if (this.hasTextButtonsTarget) {
        this.textButtonsTarget.classList.remove("hidden")
      }
      this.statusTarget.textContent = "Type your message"
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
