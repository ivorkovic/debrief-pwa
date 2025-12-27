import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["button", "icon", "timer", "status", "form", "audioInput"]

  connect() {
    this.recording = false
    this.mediaRecorder = null
    this.audioChunks = []
    this.startTime = null
    this.timerInterval = null
  }

  async toggle() {
    if (this.recording) {
      this.stop()
    } else {
      await this.start()
    }
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000
        }
      })

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
        this.upload()
        stream.getTracks().forEach(track => track.stop())
      }

      this.mediaRecorder.start(1000) // Collect data every second
      this.recording = true
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
    this.recording = false
    this.stopTimer()
    this.updateUI()
    this.statusTarget.textContent = "Uploading..."
  }

  upload() {
    const mimeType = this.mediaRecorder.mimeType
    const extension = mimeType.includes("webm") ? "webm" : "mp4"
    const blob = new Blob(this.audioChunks, { type: mimeType })
    const file = new File([blob], `debrief_${Date.now()}.${extension}`, { type: mimeType })

    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    this.audioInputTarget.files = dataTransfer.files

    this.formTarget.requestSubmit()
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
    if (this.recording) {
      this.buttonTarget.classList.remove("bg-red-500", "hover:bg-red-600")
      this.buttonTarget.classList.add("bg-red-600", "animate-pulse")
      this.iconTarget.classList.remove("rounded-full")
      this.iconTarget.classList.add("rounded-sm", "w-8", "h-8")
      this.iconTarget.classList.remove("w-12", "h-12")
      this.statusTarget.textContent = "Recording... Tap to stop"
    } else {
      this.buttonTarget.classList.add("bg-red-500", "hover:bg-red-600")
      this.buttonTarget.classList.remove("bg-red-600", "animate-pulse")
      this.iconTarget.classList.add("rounded-full", "w-12", "h-12")
      this.iconTarget.classList.remove("rounded-sm", "w-8", "h-8")
      this.statusTarget.textContent = "Tap to record"
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
