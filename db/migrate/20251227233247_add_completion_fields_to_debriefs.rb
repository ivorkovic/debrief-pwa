class AddCompletionFieldsToDebriefs < ActiveRecord::Migration[8.1]
  def change
    add_column :debriefs, :completion_summary, :text
    add_column :debriefs, :completed_at, :datetime
  end
end
