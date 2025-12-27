module ApplicationHelper
  def render_status_badge(debrief)
    # Completed takes priority if set
    if debrief.completed_at.present?
      return content_tag :span, "Completed", class: "text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400"
    end

    classes = case debrief.status
    when "done"
      "bg-green-500/20 text-green-400"
    when "pending", "transcribing"
      "bg-yellow-500/20 text-yellow-400"
    when "failed"
      "bg-red-500/20 text-red-400"
    end

    label = case debrief.status
    when "done"
      debrief.notified_at? ? "Sent" : "Ready"
    else
      debrief.status.capitalize
    end

    content_tag :span, label, class: "text-xs px-2 py-1 rounded #{classes}"
  end
end
