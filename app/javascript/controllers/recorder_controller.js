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
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000
        }
      })

      this.stream = stream
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.getSupportedMimeType()
      })

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

      this.mediaRecorder.start(1000)
      this.state = "recording"
      this.startTime = Date.now()
      this.startTimer()
      this.updateUI()
    } catch (error) {
      console.error("Failed to start recording:", error)
      this.statusTarget.textContent = "Microphone access denied"
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop()
    }
    this.stopTimer()
    // Don't change state here - onstop will call showPreview
  }

  cancel() {
    // Cancel during recording or preview
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
    }
    this.stopTimer()
    this.audioChunks = []
    this.audioBlob = null
    this.state = "idle"
    this.timerTarget.textContent = "00:00"
    this.updateUI()
  }

  showPreview() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
    }
    this.state = "preview"
    this.updateUI()
  }

  async send() {
    if (!this.audioBlob) return

    this.statusTarget.textContent = "Uploading..."
    this.previewButtonsTarget.classList.add("hidden")

    const mimeType = this.mediaRecorder.mimeType
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
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus"
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return "audio/webm"
  }
}
