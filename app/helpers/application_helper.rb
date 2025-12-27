module ApplicationHelper
  def render_status_badge(debrief)
    classes = case debrief.status
    when "done"
      "bg-green-500/20 text-green-400"
    when "pending", "transcribing"
      "bg-yellow-500/20 text-yellow-400"
    when "failed"
      "bg-red-500/20 text-red-400"
    end

    content_tag :span, debrief.status.capitalize, class: "text-xs px-2 py-1 rounded #{classes}"
  end
end
